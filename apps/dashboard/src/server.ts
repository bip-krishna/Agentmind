import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { Memory } from "../../../packages/core/src/memory.js";
import { SqliteMemoryStore } from "../../../packages/storage/src/sqlite-store.js";
import { LocalEmbeddingProvider } from "../../../packages/embeddings/src/local.js";
import * as fs from "node:fs";
import * as path from "node:path";

const PORT = Number(process.env.PORT ?? 4317);
const DB_PATH = process.env.CTX_MEMORY_DB ?? "./.context-memory/memory.db";

const store = new SqliteMemoryStore({ path: DB_PATH });
const embed = new LocalEmbeddingProvider();

function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
  res.end(JSON.stringify(data, null, 2));
}

function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); }
    });
  });
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
    return res.end();
  }

  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const pathname = url.pathname;

  try {
    // GET /api/projects
    if (req.method === "GET" && pathname === "/api/projects") {
      const projects = await store.listProjects();
      return json(res, projects);
    }

    // GET /api/projects/:id/stats
    if (req.method === "GET" && pathname.match(/^\/api\/projects\/[^/]+\/stats$/)) {
      const projectId = pathname.split("/")[3];
      const memories = await store.listMemories(projectId);
      const byType: Record<string, number> = {};
      for (const m of memories) byType[m.type] = (byType[m.type] ?? 0) + 1;
      return json(res, { projectId, total: memories.length, active: memories.filter(m => !m.archived && m.status==="active").length, archived: memories.filter(m=>m.archived).length, superseded: memories.filter(m=>m.status==="superseded").length, byType });
    }

    // GET /api/projects/:id/memories
    if (req.method === "GET" && pathname.match(/^\/api\/projects\/[^/]+\/memories$/)) {
      const projectId = pathname.split("/")[3];
      const type = url.searchParams.get("type");
      const importance = url.searchParams.get("minImportance");
      let memories = await store.listMemories(projectId);
      if (type) memories = memories.filter(m => m.type === type);
      if (importance) memories = memories.filter(m => m.importance >= Number(importance));
      if (url.searchParams.get("archived") === "false") memories = memories.filter(m => !m.archived);
      return json(res, memories);
    }

    // POST /api/projects/:id/consolidate
    if (req.method === "POST" && pathname.match(/^\/api\/projects\/[^/]+\/consolidate$/)) {
      const projectId = pathname.split("/")[3];
      const mem = await Memory.create({ project: projectId, store, embeddingProvider: embed });
      // Try to resolve project id to name; if fails use id
      const results = await mem.consolidate();
      return json(res, results);
    }

    // GET /api/memories/:id
    if (req.method === "GET" && pathname.match(/^\/api\/memories\/[^/]+$/)) {
      const id = pathname.split("/")[3];
      const mem = await store.getMemory(id);
      if (!mem) return json(res, { error: "not found" }, 404);
      const emb = await store.getEmbedding(id);
      const source = mem.sourceId ? await store.getSource(mem.sourceId) : null;
      return json(res, { ...mem, embedding: emb ? { model: emb.model, dimensions: emb.vector.length, preview: emb.vector.slice(0,5) } : null, source });
    }

    // PATCH /api/memories/:id
    if (req.method === "PATCH" && pathname.match(/^\/api\/memories\/[^/]+$/)) {
      const id = pathname.split("/")[3];
      const body = await parseBody(req);
      await store.updateMemory(id, body);
      const mem = await store.getMemory(id);
      return json(res, mem);
    }

    // DELETE /api/memories/:id
    if (req.method === "DELETE" && pathname.match(/^\/api\/memories\/[^/]+$/)) {
      const id = pathname.split("/")[3];
      await store.deleteMemory(id);
      return json(res, { ok: true });
    }

    // DELETE /api/projects/:id
    if (req.method === "DELETE" && pathname.match(/^\/api\/projects\/[^/]+$/)) {
      const id = pathname.split("/")[3];
      await store.deleteProject(id);
      return json(res, { ok: true });
    }

    // GET /api/projects/:id/export
    if (req.method === "GET" && pathname.match(/^\/api\/projects\/[^/]+\/export$/)) {
      const id = pathname.split("/")[3];
      const memories = await store.listMemories(id);
      return json(res, { projectId: id, memories });
    }

    // POST /api/search
    if (req.method === "POST" && pathname === "/api/search") {
      const body = await parseBody(req);
      const { project, query, limit = 5, types } = body;
      if (!project || !query) return json(res, { error: "project and query required" }, 400);
      const mem = await Memory.create({ project, store, embeddingProvider: embed });
      const results = await mem.search(query, { limit, types });
      return json(res, results);
    }

    // POST /api/context — Context Inspector
    if (req.method === "POST" && pathname === "/api/context") {
      const body = await parseBody(req);
      const { project, query, maxTokens = 6000, limit = 10 } = body;
      if (!project || !query) return json(res, { error: "project and query required" }, 400);
      const mem = await Memory.create({ project, store, embeddingProvider: embed });
      const ctx = await mem.context({ query, maxTokens, limit });
      // Also return retrieval details for inspector
      const searchResults = await mem.search(query, { limit });
      return json(res, { ...ctx, retrieval: searchResults.map(r => ({ id: r.memory.id, content: r.memory.content, score: r.score, semanticScore: r.semanticScore, keywordScore: r.keywordScore, type: r.memory.type, importance: r.memory.importance })) });
    }

    // POST /api/ingest
    if (req.method === "POST" && pathname === "/api/ingest") {
      const body = await parseBody(req);
      const { project, role = "user", content, type = "conversation" } = body;
      if (!project || !content) return json(res, { error: "project and content required" }, 400);
      const mem = await Memory.create({ project, store, embeddingProvider: embed });
      const result = await mem.ingest({ role, content, sourceType: type });
      return json(res, result);
    }

    // POST /api/remember
    if (req.method === "POST" && pathname === "/api/remember") {
      const body = await parseBody(req);
      const { project, content, type = "fact", importance = 0.5 } = body;
      if (!project || !content) return json(res, { error: "project and content required" }, 400);
      const mem = await Memory.create({ project, store, embeddingProvider: embed });
      const created = await mem.remember({ content, type, importance });
      return json(res, created);
    }

    // GET /api/retrievals/:projectId
    if (req.method === "GET" && pathname.match(/^\/api\/retrievals\/[^/]+$/)) {
      const projectId = pathname.split("/")[3];
      const events = await store.listRetrievals(projectId);
      return json(res, events);
    }

    // Static dashboard
    if (pathname === "/" || pathname === "/index.html") {
      const htmlPath = path.join(import.meta.dirname ?? ".", "dashboard.html");
      if (fs.existsSync(htmlPath)) {
        res.writeHead(200, { "Content-Type": "text/html" });
        return res.end(fs.readFileSync(htmlPath, "utf-8"));
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(DASHBOARD_HTML);
    }

    json(res, { error: "not found", path: pathname }, 404);
  } catch (e: any) {
    json(res, { error: e.message ?? String(e), stack: e.stack }, 500);
  }
});

const DASHBOARD_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Context Memory Dashboard</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  ::-webkit-scrollbar{width:6px;height:6px} ::-webkit-scrollbar-thumb{background:#3f3f46;border-radius:3px}
</style>
</head><body class="bg-zinc-950 text-zinc-100 min-h-screen">
<div class="max-w-7xl mx-auto p-6">
  <header class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold tracking-tight">Context Memory <span class="text-zinc-500 font-normal">localhost</span></h1>
    <div class="flex gap-2">
      <select id="projectSelect" class="bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-sm"></select>
      <button onclick="loadProjects()" class="bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded text-sm">Refresh</button>
    </div>
  </header>

  <!-- Overview -->
  <div id="overview" class="grid grid-cols-4 gap-4 mb-6">
    <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-4"><div class="text-xs text-zinc-500">Total Memories</div><div id="stat-total" class="text-2xl font-mono">-</div></div>
    <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-4"><div class="text-xs text-zinc-500">Active / Archived</div><div id="stat-active" class="text-2xl font-mono">-</div></div>
    <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-4"><div class="text-xs text-zinc-500">By Type</div><div id="stat-types" class="text-xs font-mono">-</div></div>
    <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-4"><div class="text-xs text-zinc-500">Embedding</div><div class="text-xs font-mono">Local hash 256d<br>pgvector ready</div></div>
  </div>

  <!-- Tabs -->
  <div class="flex gap-2 mb-4 border-b border-zinc-800">
    <button onclick="showTab('memories')" id="tab-memories" class="px-4 py-2 text-sm font-medium border-b-2 border-white">Memories</button>
    <button onclick="showTab('inspector')" id="tab-inspector" class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-zinc-400">Context Inspector</button>
    <button onclick="showTab('retrieval')" id="tab-retrieval" class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-zinc-400">Retrieval Logs</button>
    <button onclick="showTab('consolidate')" id="tab-consolidate" class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-zinc-400">Consolidation</button>
  </div>

  <!-- Memories -->
  <div id="view-memories">
    <div class="flex gap-2 mb-3">
      <input id="memSearch" placeholder="Search memories..." class="flex-1 bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm" oninput="filterMemories()">
      <select id="typeFilter" class="bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm" onchange="filterMemories()">
        <option value="">All types</option><option>fact</option><option>decision</option><option>knowledge</option><option>preference</option><option>procedure</option><option>task</option><option>summary</option>
      </select>
      <button onclick="loadMemories()" class="bg-white text-black px-4 py-2 rounded text-sm font-medium">Search</button>
    </div>
    <div id="memoryList" class="grid gap-3"></div>
  </div>

  <!-- Inspector -->
  <div id="view-inspector" class="hidden">
    <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-4">
      <div class="text-sm font-medium mb-2">Ask your memory</div>
      <div class="flex gap-2">
        <input id="inspectorQuery" placeholder="What database did we decide to use?" class="flex-1 bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm">
        <button onclick="runInspector()" class="bg-white text-black px-4 py-2 rounded text-sm font-medium">Run</button>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-4">
      <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div class="text-xs text-zinc-500 mb-2">RETRIEVED MEMORIES</div>
        <div id="inspectorRetrieved" class="space-y-2 text-sm"></div>
      </div>
      <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div class="text-xs text-zinc-500 mb-2">FINAL CONTEXT <span id="inspectorTokens" class="font-mono"></span></div>
        <pre id="inspectorContext" class="text-xs font-mono whitespace-pre-wrap bg-zinc-950 p-3 rounded"></pre>
      </div>
    </div>
  </div>

  <!-- Retrieval -->
  <div id="view-retrieval" class="hidden">
    <div id="retrievalList" class="space-y-2"></div>
  </div>

  <!-- Consolidate -->
  <div id="view-consolidate" class="hidden">
    <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <button onclick="runConsolidate()" class="bg-white text-black px-4 py-2 rounded text-sm font-medium">Run consolidation</button>
      <div id="consolidateResult" class="mt-4 text-sm font-mono"></div>
    </div>
  </div>

  <!-- Memory detail modal -->
  <dialog id="detailModal" class="bg-zinc-900 text-zinc-100 p-6 rounded-lg max-w-2xl w-full border border-zinc-800">
    <div id="detailContent"></div>
    <button onclick="this.closest('dialog').close()" class="mt-4 bg-zinc-800 px-4 py-2 rounded text-sm">Close</button>
  </dialog>
</div>

<script>
let currentProject = null;
let allMemories = [];

async function loadProjects(){
  const projects = await fetch('/api/projects').then(r=>r.json());
  const sel = document.getElementById('projectSelect');
  sel.innerHTML = projects.map(p=>\`<option value="\${p.id}">\${p.name}</option>\`).join('');
  if(projects[0]){ currentProject = projects[0].id; sel.value = currentProject; loadOverview(); loadMemories(); loadRetrievals(); }
  sel.onchange = e=>{ currentProject = e.target.value; loadOverview(); loadMemories(); loadRetrievals(); };
}
async function loadOverview(){
  if(!currentProject) return;
  const stats = await fetch('/api/projects/'+currentProject+'/stats').then(r=>r.json());
  document.getElementById('stat-total').textContent = stats.total;
  document.getElementById('stat-active').textContent = stats.active + ' / ' + stats.archived;
  document.getElementById('stat-types').innerHTML = Object.entries(stats.byType).map(([k,v])=>\`\${k}: \${v}\`).join('<br>');
}
async function loadMemories(){
  if(!currentProject) return;
  const memories = await fetch('/api/projects/'+currentProject+'/memories').then(r=>r.json());
  allMemories = memories;
  renderMemories(memories);
}
function renderMemories(memories){
  const typeFilter = document.getElementById('typeFilter').value;
  const q = document.getElementById('memSearch').value.toLowerCase();
  let filtered = memories;
  if(typeFilter) filtered = filtered.filter(m=>m.type===typeFilter);
  if(q) filtered = filtered.filter(m=>m.content.toLowerCase().includes(q));
  document.getElementById('memoryList').innerHTML = filtered.map(m=>\`
    <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 cursor-pointer" onclick="showDetail('\${m.id}')">
      <div class="flex items-center gap-2 mb-1">
        <span class="text-xs px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700">\${m.type}</span>
        <span class="text-xs \${m.status==='active'?'text-emerald-400':m.status==='superseded'?'text-amber-400':'text-zinc-500'}">\${m.status}</span>
        <span class="text-xs text-zinc-500 ml-auto">\${m.importance.toFixed(2)} · \${m.accessCount} uses</span>
      </div>
      <div class="text-sm">\${m.content}</div>
      <div class="text-xs text-zinc-500 mt-1">\${new Date(m.createdAt).toLocaleDateString()} · \${m.archived?'archived':''}</div>
    </div>\`).join('') || '<div class="text-sm text-zinc-500">No memories</div>';
}
function filterMemories(){ renderMemories(allMemories); }
async function showDetail(id){
  const m = await fetch('/api/memories/'+id).then(r=>r.json());
  document.getElementById('detailContent').innerHTML = \`
    <div class="text-xs text-zinc-500">\${m.type} · \${m.status}</div>
    <div class="text-lg mt-2">\${m.content}</div>
    <div class="grid grid-cols-2 gap-4 mt-4 text-xs font-mono">
      <div>Importance: \${m.importance}<br>Confidence: \${m.confidence}<br>Status: \${m.status}<br>Access: \${m.accessCount}</div>
      <div>Created: \${new Date(m.createdAt).toLocaleString()}<br>Updated: \${new Date(m.updatedAt).toLocaleString()}<br>Project: \${m.projectId.slice(0,8)}</div>
    </div>
    <div class="mt-3 text-xs">\${m.source ? 'Source: '+m.source.content : ''}</div>
    <div class="mt-3 text-xs">Embedding: \${m.embedding ? m.embedding.model + ' ' + m.embedding.dimensions + 'd preview ' + JSON.stringify(m.embedding.preview) : 'none'}</div>
    <button onclick="deleteMemory('\${m.id}')" class="mt-4 bg-red-900 hover:bg-red-800 px-3 py-1.5 rounded text-sm">Delete</button>
  \`;
  document.getElementById('detailModal').showModal();
}
async function deleteMemory(id){ await fetch('/api/memories/'+id,{method:'DELETE'}); document.getElementById('detailModal').close(); loadMemories(); loadOverview(); }
function showTab(name){
  ['memories','inspector','retrieval','consolidate'].forEach(t=>{
    document.getElementById('view-'+t).classList.toggle('hidden', t!==name);
    document.getElementById('tab-'+t).className = t===name ? 'px-4 py-2 text-sm font-medium border-b-2 border-white' : 'px-4 py-2 text-sm font-medium border-b-2 border-transparent text-zinc-400';
  });
  if(name==='retrieval') loadRetrievals();
}
async function runInspector(){
  const query = document.getElementById('inspectorQuery').value;
  if(!query) return;
  const res = await fetch('/api/context',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project: currentProject, query})}).then(r=>r.json());
  document.getElementById('inspectorTokens').textContent = '['+res.tokenCount+' tokens]';
  document.getElementById('inspectorContext').textContent = res.text || '(no relevant memories)';
  document.getElementById('inspectorRetrieved').innerHTML = (res.retrieval||[]).map((r,i)=>\`
    <div class="bg-zinc-950 border border-zinc-800 rounded p-2">
      <div class="flex justify-between text-xs"><span>#\${i+1} \${r.type}</span><span class="font-mono">score \${r.score.toFixed(3)} · sem \${r.semanticScore.toFixed(2)} · kw \${r.keywordScore.toFixed(2)}</span></div>
      <div class="text-sm mt-1">\${r.content}</div>
    </div>\`).join('');
}
async function loadRetrievals(){
  if(!currentProject) return;
  const events = await fetch('/api/retrievals/'+currentProject).then(r=>r.json());
  document.getElementById('retrievalList').innerHTML = events.map(e=>\`
    <div class="bg-zinc-900 border border-zinc-800 rounded p-3">
      <div class="text-sm">Query: "\${e.query}"</div>
      <div class="text-xs text-zinc-500">\${new Date(e.createdAt).toLocaleString()} · \${e.retrievedMemoryIds.length} memories · \${e.finalContextTokens} tokens</div>
      <div class="text-xs font-mono mt-1">scores: \${JSON.stringify(e.scores).slice(0,120)}</div>
    </div>\`).join('') || '<div class="text-sm text-zinc-500">No retrievals yet</div>';
}
async function runConsolidate(){
  const res = await fetch('/api/projects/'+currentProject+'/consolidate',{method:'POST'}).then(r=>r.json());
  document.getElementById('consolidateResult').textContent = JSON.stringify(res,null,2);
  loadMemories(); loadOverview();
}

loadProjects();
</script>
</body></html>`;

server.listen(PORT, () => {
  console.log(`Context Memory dashboard at http://localhost:${PORT}`);
  console.log(`DB: ${DB_PATH}`);
});

export { server, store };
