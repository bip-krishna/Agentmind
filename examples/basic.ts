import { Memory } from "../packages/core/src/memory.js";
import { InMemoryStore } from "../packages/storage/src/memory-store.js";
import { LocalEmbeddingProvider } from "../packages/embeddings/src/local.js";

const store = new InMemoryStore();
const memory = await Memory.create({
  project: "research-mesh",
  store,
  embeddingProvider: new LocalEmbeddingProvider(),
});

await memory.remember({
  type: "decision",
  content: "We decided to use PostgreSQL with pgvector.",
  importance: 0.9,
});

const context = await memory.context({
  query: "What database did we decide to use?",
  maxTokens: 6000,
});

console.log(context.text);
// Relevant project memory (research-mesh):
// - We decided to use PostgreSQL with pgvector.
