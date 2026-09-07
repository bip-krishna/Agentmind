# context-memory

**Persistent, project-scoped context layer for AI applications.**

> A persistent, project-scoped context layer — not a vector DB wrapper.

```ts
memory.remember()
memory.search()
memory.context()
memory.forget()
```

## Install

```bash
npm install context-memory
```

## Quick start

```ts
import { Memory } from "context-memory";
import { SqliteMemoryStore } from "context-memory/storage";
import { LocalEmbeddingProvider } from "context-memory/embeddings";

const store = new SqliteMemoryStore({ path: "./.context-memory/memory.db" });
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
              context-memory
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
- **Extraction** — `HeuristicExtractor` + `LLMExtractor` with `EXTRACTION_PROMPT`, `ToxicPolicy` filtering
- **Consolidation** — `Consolidator` clusters via cosine >0.82, creates `summary` memories, archives sources
- **Lifecycle** — `extracted -> candidate -> validated -> stored -> retrieved -> updated -> archived`

### Context (Phase 6)
- `memory.context({ query, maxTokens, limit, types }) -> { text, tokenCount, memories, sources, retrieval }`
- Retrieval logging to `retrieval_events`

### Production (Phase 9)
- **SQLite** via `node:sqlite` `DatabaseSync` (Node 22+, zero native deps) + `InMemoryStore`
- **Postgres + pgvector** — `PostgresMemoryStore` (`pg` Pool, `CREATE EXTENSION vector`, `vec vector(1536)`, `hnsw` index, `vec <=> $1` native search, falls back to hybrid)
- **Migrations** — `packages/storage/src/migrations.ts` versioned, `schema_migrations`
- **Config** — `resolveStorageConfig()` auto-detects `DATABASE_URL` else `CTX_MEMORY_DB` else `.context-memory/memory.db`, `autoDetectProject()` via `package.json`/cwd
- **Security** — DB-level `project_id` filter, no cross-project leakage
- **Privacy** — `forget(id)` deletes embedding, `forgetProject()`, `export()`, `storeSensitiveData=false` blocks `password/api key/secret`

### Observability & Policy
```ts
memory.on("memory.created", m => ...)
memory.on("retrieval.completed", e => ...)
memory.on("memory.superseded", (old, next) => ...)

const memory = await Memory.create({
  project: "x",
  policy: {
    autoExtract: true,
    minimumImportance: 0.65,
    maxMemoriesPerProject: 10000,
    storeSensitiveData: false,
    shouldRemember: (m) => !m.content.includes("greeting"),
    maxTokensPerContext: 6000,
  }
});
```

### Integrations (Phase 10)
```ts
import { withMemory, createOpenAICaller } from "context-memory/integrations";
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const { response, context } = await withMemory({
  memory,
  messages: [{ role: "user", content: "What's our DB?" }],
  callLLM: createOpenAICaller(openai, "gpt-4o"),
});
// retrieve -> context -> LLM -> extract -> store automated
```
Adapters: `withMemory` (OpenAI), `withAnthropicMemory`, `withMemoryAISDK` (Vercel), `withLangChainMemory`.

### Dashboard `npx context-memory dashboard`

```
http://localhost:4317
├── Overview (total/active/archived/byType)
├── Memories (search, filter by type/importance, detail with embedding preview, source)
├── Context Inspector (query -> embedding -> vector+keyword -> ranking -> final context, token count)
├── Retrieval Logs (query, scores, tokens, timestamp)
└── Consolidation (cluster & archive)
```

**API:**
```
GET    /api/projects
GET    /api/projects/:id/stats
GET    /api/projects/:id/memories?type=&minImportance=
POST   /api/projects/:id/consolidate
GET    /api/memories/:id
PATCH  /api/memories/:id
DELETE /api/memories/:id
POST   /api/search         { project, query, limit }
POST   /api/context        { project, query, maxTokens } -> { text, retrieval[] }
POST   /api/remember       { project, content, type, importance }
POST   /api/ingest         { project, role, content }
GET    /api/retrievals/:projectId
DELETE /api/projects/:id
GET    /api/projects/:id/export
```

### CLI
```bash
npx context-memory init --project research-mesh
npx context-memory project list
npx context-memory memory search --project research-mesh --query "database"
npx context-memory memory consolidate --project research-mesh
npx context-memory ingest --project research-mesh --content "We use Postgres" --role user
npx context-memory export --project research-mesh
npx context-memory dashboard --port 4317
```

## Evaluation

```bash
npm test          # vitest — 13 tests
npm run test:mvp  # mvp harness
```

Covers: retrieval precision/recall, context efficiency, cross-project leakage (0 failures), goldfish (Day 1 -> Day 30), deduplication, token budgeting, consolidation, conflict, privacy.

## Packaging

```json
// package.json exports
".": "./dist/packages/core/src/index.js",
"./storage": "./dist/packages/storage/src/index.js",
"./embeddings": "./dist/packages/embeddings/src/index.js",
"./integrations": "./dist/packages/integrations/src/index.js",
"./retrieval": "./dist/packages/retrieval/src/index.js"
```

Modular: `@context-memory/core`, `@context-memory/storage`, etc. Umbrella `context-memory` installs defaults.

## Roadmap

- Phase 8: React/Vite dashboard with graph visualization
- Phase 11: Redis cache, multi-tenant `organization_id`, OTEL, `pnpm` + `turborepo`
