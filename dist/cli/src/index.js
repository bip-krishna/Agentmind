#!/usr/bin/env node
import { Memory } from "../../packages/core/src/memory.js";
import { SqliteMemoryStore } from "../../packages/storage/src/sqlite-store.js";
import { LocalEmbeddingProvider } from "../../packages/embeddings/src/local.js";
import * as fs from "node:fs";
const DB_PATH = process.env.AGENTMIND_DB ?? process.env.CTX_MEMORY_DB ?? "./.agentmind/memory.db";
const store = new SqliteMemoryStore({ path: DB_PATH });
const embed = new LocalEmbeddingProvider();
const [, , cmd, ...args] = process.argv;
function help() {
    console.log(`
agentmind (formerly context-memory)

Usage:
  agentmind init [--project <name>]
  agentmind project list
  agentmind project create <name>
  agentmind project delete <name>
  agentmind memory list --project <name> [--type <type>] [--limit <n>]
  agentmind memory search --project <name> --query "text" [--limit 5]
  agentmind memory show <id>
  agentmind memory delete <id>
  agentmind memory consolidate --project <name>
  agentmind ingest --project <name> --content "text" [--role user]
  agentmind export --project <name> [--include-archived]
  agentmind dashboard [--port 4317]

Aliases: context-memory (legacy)
`);
}
async function main() {
    if (!cmd || cmd === "help" || cmd === "--help")
        return help();
    if (cmd === "init") {
        fs.mkdirSync("./.agentmind", { recursive: true });
        // legacy compat
        if (!fs.existsSync("./.context-memory"))
            fs.mkdirSync("./.context-memory", { recursive: true });
        console.log("Initialized .agentmind/");
        console.log(`DB: ${DB_PATH}`);
        const pIdx = args.indexOf("--project");
        if (pIdx !== -1) {
            const name = args[pIdx + 1];
            const mem = await Memory.create({ project: name, store });
            console.log(`Project: ${mem.project.name} (${mem.project.id})`);
        }
        return;
    }
    if (cmd === "project") {
        const sub = args[0];
        if (sub === "list") {
            const projects = await store.listProjects();
            console.log(JSON.stringify(projects, null, 2));
            return;
        }
        if (sub === "create") {
            const name = args[1];
            if (!name)
                throw new Error("name required");
            const mem = await Memory.create({ project: name, store });
            console.log(`Created project: ${mem.project.name} (${mem.project.id})`);
            return;
        }
        if (sub === "delete") {
            const name = args[1];
            if (!name)
                throw new Error("name required");
            const proj = await store.getProjectByName(name) ?? await store.getProject(name);
            if (!proj)
                throw new Error("not found");
            await store.deleteProject(proj.id);
            console.log(`Deleted ${name}`);
            return;
        }
    }
    if (cmd === "memory") {
        const sub = args[0];
        if (sub === "list") {
            const pIdx = args.indexOf("--project");
            const project = pIdx !== -1 ? args[pIdx + 1] : null;
            if (!project)
                throw new Error("--project required");
            const mem = await Memory.create({ project, store });
            const exported = await mem.export();
            console.log(JSON.stringify(exported.memories, null, 2));
            return;
        }
        if (sub === "search") {
            const pIdx = args.indexOf("--project");
            const qIdx = args.indexOf("--query");
            const lIdx = args.indexOf("--limit");
            const project = pIdx !== -1 ? args[pIdx + 1] : null;
            const query = qIdx !== -1 ? args[qIdx + 1] : null;
            const limit = lIdx !== -1 ? Number(args[lIdx + 1]) : 5;
            if (!project || !query)
                throw new Error("--project and --query required");
            const mem = await Memory.create({ project, store, embeddingProvider: embed });
            const results = await mem.search(query, { limit });
            console.log(JSON.stringify(results, null, 2));
            return;
        }
        if (sub === "consolidate") {
            const pIdx = args.indexOf("--project");
            const project = pIdx !== -1 ? args[pIdx + 1] : null;
            if (!project)
                throw new Error("--project required");
            const mem = await Memory.create({ project, store, embeddingProvider: embed });
            const results = await mem.consolidate();
            console.log(JSON.stringify(results, null, 2));
            return;
        }
        if (sub === "show") {
            const id = args[1];
            const m = await store.getMemory(id);
            console.log(JSON.stringify(m, null, 2));
            return;
        }
        if (sub === "delete") {
            const id = args[1];
            await store.deleteMemory(id);
            console.log(`Deleted ${id}`);
            return;
        }
    }
    if (cmd === "ingest") {
        const pIdx = args.indexOf("--project");
        const cIdx = args.indexOf("--content");
        const rIdx = args.indexOf("--role");
        const project = pIdx !== -1 ? args[pIdx + 1] : null;
        const content = cIdx !== -1 ? args[cIdx + 1] : null;
        const role = rIdx !== -1 ? args[rIdx + 1] : "user";
        if (!project || !content)
            throw new Error("--project and --content required");
        const mem = await Memory.create({ project, store });
        const res = await mem.ingest({ role, content });
        console.log(JSON.stringify(res, null, 2));
        return;
    }
    if (cmd === "export") {
        const pIdx = args.indexOf("--project");
        const project = pIdx !== -1 ? args[pIdx + 1] : null;
        if (!project)
            throw new Error("--project required");
        const includeArchived = args.includes("--include-archived");
        const mem = await Memory.create({ project, store });
        const data = await mem.export({ includeArchived });
        const out = `${project}.export.json`;
        fs.writeFileSync(out, JSON.stringify(data, null, 2));
        console.log(`Exported to ${out} (${data.memories.length} memories)`);
        return;
    }
    if (cmd === "dashboard") {
        const pIdx = args.indexOf("--port");
        const port = pIdx !== -1 ? args[pIdx + 1] : "4317";
        process.env.PORT = port;
        await import("../../apps/dashboard/src/server.js");
        return;
    }
    help();
}
main().catch(e => { console.error(e.message); process.exit(1); });
//# sourceMappingURL=index.js.map