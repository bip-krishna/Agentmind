# agentmind

**Persistent, project-scoped context layer for AI applications.**

> A persistent, project-scoped context layer — not a vector DB wrapper.
> Formerly `context-memory` — now `agentmind`. The `context-memory` CLI/bin remains as an alias.

```ts
memory.remember()
memory.search()
memory.context()
memory.forget()
```

## Install

```bash
npm install agentmind
# legacy alias still works:
npm install context-memory
```

## Quick start

```ts
import { Memory } from "agentmind";
import { SqliteMemoryStore } from "agentmind/storage";
import { LocalEmbeddingProvider } from "agentmind/embeddings";

const store = new SqliteMemoryStore({ path: "./.agentmind/memory.db" });
const memory = await Memory.create({
  project: "research-mesh",
  store,
  embeddingProvider: new LocalEmbeddingProvider(), // or OpenAIEmbeddingProvider
});

await memory.remember({
  type: "decision",
  content: "We decided to use PostgreSQL with pgvector.",
  importance: 0.9,
});

const ctx = await memory.context({ query: "What database did we decide to use?" });
console.log(ctx.text);
// Relevant project memory (research-mesh):
// - We decided to use PostgreSQL with pgvector.
```

## Architecture

```
              agentmind
                    │
     ┌──────────────┼──────────────┐
     ▼              ▼              ▼
Memory Engine  Embedding Engine  Dashboard
     │              │              │
     ▼              ▼              ▼
 Retriever      OpenAI/etc.      HTTP API (4317)
     │
     ▼
 Store Adapter
     │
 ┌───┴─────────────────┐
 ▼                     ▼
SQLite (node:sqlite)  Postgres + pgvector
InMemory (tests)       (pg Pool, hnsw)
```

**Store is the abstraction** — `MemoryStore` interface: `SqliteMemoryStore` and `PostgresMemoryStore` interchangeable.

## Features

### Core (Phases 1-4)
- **Project isolation** — `WHERE project_id=?` enforced before vector search (0 leakage, tested 50 queries)
- **Manual memory creation** — `type`, `importance`, `confidence`, `metadata`, `sourceId`
- **Embedding abstraction** — `EmbeddingProvider` (`OpenAIEmbeddingProvider`, `LocalEmbeddingProvider` deterministic hash 256d)
- **Decoupled embeddings** — `embeddings` table separate, re-embeddable per model
- **Hybrid retrieval** — `semantic×0.6 + keyword×0.2 + importance×0.1 + recency×0.1` (configurable `HybridRanker`)
- **Token budgeting** — `maxTokens` enforced greedily
- **Deduplication** — Jaccard >0.85 updates existing
- **Conflict resolution** — triggers `switched to/migrated to/now using` + embedding similarity >0.82 supersedes old

### Intelligence (Phase 5)
- **Extraction** — `HeuristicExtractor` + `LLMExtractor` with `EXTRACTION_PROMPT`
- **Consolidation** — `Consolidator` clusters via cosine >0.82, creates `summary` memories, archives sources
- **Lifecycle** — `extracted -> candidate -> validated -> stored -> retrieved -> updated -> archived`

### Context (Phase 6)
- `memory.context({ query, maxTokens, limit, types }) -> { text, tokenCount, memories, sources, retrieval }`
- Retrieval logging to `retrieval_events`

### Production (Phase 9)
- **SQLite** via `node:sqlite` `DatabaseSync` (Node 22+, zero native deps) + `InMemoryStore`
- **Postgres + pgvector** — `PostgresMemoryStore` (`pg` Pool, `CREATE EXTENSION vector`, `vec vector(1536)`, `hnsw` index, `vec <=> $1` native search)
- **Migrations** — `packages/storage/src/migrations.ts` versioned, `schema_migrations`
- **Config** — `resolveStorageConfig()` auto-detects `DATABASE_URL` else `AGENTMIND_DB`/`CTX_MEMORY_DB` else `.agentmind/memory.db`
- **Security** — DB-level `project_id` filter, no cross-project leakage
- **Privacy** — `forget(id)` deletes embedding, `forgetProject()`, `export()`, `storeSensitiveData=false`

### Observability & Policy
```ts
memory.on("memory.created", m => ...)
memory.on("retrieval.completed", e => ...)

const memory = await Memory.create({
  project: "x",
  policy: {
    autoExtract: true,
    minimumImportance: 0.65,
    maxMemoriesPerProject: 10000,
    storeSensitiveData: false,
    shouldRemember: (m) => !m.content.includes("greeting"),
  }
});
```

### Integrations (Phase 10)
```ts
import { withMemory, createOpenAICaller } from "agentmind/integrations";
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const { response } = await withMemory({
  memory,
  messages: [{ role: "user", content: "What's our DB?" }],
  callLLM: createOpenAICaller(openai, "gpt-4o"),
});
```
Adapters: `withMemory` (OpenAI), `withAnthropicMemory`, `withMemoryAISDK` (Vercel), `withLangChainMemory`.

### Dashboard `npx agentmind dashboard`

```
http://localhost:4317
├── Overview (total/active/archived/byType)
├── Memories (search, filter, detail with embedding preview)
├── Context Inspector (query -> vector+keyword -> ranking -> final context)
├── Retrieval Logs
└── Consolidation
```

**API:** `GET /api/projects`, `POST /api/search`, `POST /api/context`, `POST /api/remember`, `GET /api/retrievals/:id`, etc.

### CLI
```bash
npx agentmind init --project research-mesh
npx agentmind project list
npx agentmind memory search --project research-mesh --query "database"
npx agentmind memory consolidate --project research-mesh
npx agentmind ingest --project research-mesh --content "We use Postgres"
npx agentmind export --project research-mesh
npx agentmind dashboard --port 4317
# legacy alias still works:
npx context-memory dashboard
```

## Evaluation

```bash
npm test          # vitest — 13 tests
npm run test:mvp  # mvp harness
```

## Packaging

```json
// package.json exports
".": "./dist/packages/core/src/index.js",
"./storage": "./dist/packages/storage/src/index.js",
"./embeddings": "./dist/packages/embeddings/src/index.js",
"./integrations": "./dist/packages/integrations/src/index.js",
"./retrieval": "./dist/packages/retrieval/src/index.js"
```

Modular: `@agentmind/core`, `@agentmind/storage`, etc. Umbrella `agentmind` installs defaults. Legacy `@context-memory/*` remains as alias via bin.
