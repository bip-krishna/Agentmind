import { Memory } from "../packages/core/src/memory.js";
import { InMemoryStore } from "../packages/storage/src/memory-store.js";
import { LocalEmbeddingProvider } from "../packages/embeddings/src/local.js";
import { HeuristicExtractor } from "../packages/core/src/extraction.js";

// Policy + autoExtract + observability + consolidation demo

const store = new InMemoryStore();
const memory = await Memory.create({
  project: "research-mesh",
  store,
  embeddingProvider: new LocalEmbeddingProvider(),
  extractor: new HeuristicExtractor(),
  policy: {
    autoExtract: true,
    minimumImportance: 0.6,
    maxMemoriesPerProject: 10000,
    storeSensitiveData: false,
  },
});

memory.on("memory.created", (m: any) => console.log("[event] created:", m.content.slice(0, 40)));
memory.on("retrieval.completed", (e: any) => console.log("[event] retrieval:", e.query, "->", e.retrievedMemoryIds.length));

// Ingest conversation — auto-extracts memories
await memory.ingest({ role: "user", content: "We decided to use PostgreSQL with pgvector. SQLite isn't going to work for production because we need concurrent writes. Let's proceed with that." });

const ctx = await memory.context({ query: "What database did we decide to use?", maxTokens: 6000 });
console.log(ctx.text);

// Consolidation
for (let i = 0; i < 5; i++) await memory.remember({ content: `Payment gateway timeout on API-4821 occurrence ${i}`, importance: 0.6 });
const consolidated = await memory.consolidate({ threshold: 0.5, minClusterSize: 3 });
console.log("Consolidated:", consolidated.length);

// OpenAI integration example (pseudo)
/*
import { withMemory, createOpenAICaller } from "@context-memory/integrations/openai";
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const { response } = await withMemory({
  memory,
  messages: [{ role: "user", content: "What's our DB?" }],
  callLLM: createOpenAICaller(openai, "gpt-4o"),
});
*/
