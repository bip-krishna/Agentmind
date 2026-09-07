import { Memory } from "./dist/packages/core/src/memory.js";
import { InMemoryStore } from "./dist/packages/storage/src/memory-store.js";
import { SqliteMemoryStore } from "./dist/packages/storage/src/sqlite-store.js";
import { LocalEmbeddingProvider } from "./dist/packages/embeddings/src/local.js";

async function runTests() {
  console.log("=== MVP Tests ===");

  // Test 1: InMemoryStore + Local embeddings + basic remember/search
  const store = new InMemoryStore();
  const embed = new LocalEmbeddingProvider(64);
  const memory = await Memory.create({ project: "research-mesh", store, embeddingProvider: embed });

  await memory.remember({ type: "decision", content: "We decided to use PostgreSQL with pgvector.", importance: 0.9 });
  await memory.remember({ type: "fact", content: "API-4821 is about payment gateway timeout.", importance: 0.8 });
  await memory.remember({ type: "knowledge", content: "Backend uses Node.js and Fastify.", importance: 0.6 });

  // Test search
  const result = await memory.search("What database did we decide to use?");
  console.log("Test 1 - Semantic search:", result.length > 0 ? "PASS" : "FAIL", "->", result[0]?.memory.content);
  if (!result[0]?.memory.content.includes("PostgreSQL")) throw new Error("Search failed to retrieve PostgreSQL memory");

  // Test hybrid keyword: API-4821
  const kwResult = await memory.search("What's the status of API-4821?");
  console.log("Test 2 - Hybrid keyword:", kwResult[0]?.memory.content.includes("API-4821") ? "PASS" : "FAIL", "->", kwResult[0]?.memory.content);

  // Test context budgeting
  const ctx = await memory.context({ query: "What database did we decide to use?", maxTokens: 6000 });
  console.log("Test 3 - Context:", ctx.text.includes("PostgreSQL") ? "PASS" : "FAIL", `tokens=${ctx.tokenCount}`);
  console.log("  text:", ctx.text.slice(0, 200));

  // Test project isolation
  const memoryB = await Memory.create({ project: "personal", store, embeddingProvider: embed });
  await memoryB.remember({ type: "fact", content: "We use MongoDB for personal project.", importance: 0.9 });
  const isolated = await memory.search("What database do we use?");
  console.log("Test 4 - Project isolation:", isolated[0]?.memory.content.includes("PostgreSQL") && !isolated.some(r => r.memory.content.includes("MongoDB")) ? "PASS" : "FAIL", "->", isolated[0]?.memory.content);
  const crossLeak = isolated.some(r => r.memory.projectId !== memory.project.id);
  console.log("  cross-project leak:", crossLeak ? "FAIL" : "PASS");

  // Test deduplication
  const beforeCount = (await store.listMemories(memory.project.id)).length;
  await memory.remember({ type: "decision", content: "We decided to use PostgreSQL with pgvector.", importance: 0.9 });
  const afterCount = (await store.listMemories(memory.project.id)).length;
  console.log("Test 5 - Deduplication:", beforeCount === afterCount ? "PASS" : "FAIL", `before=${beforeCount} after=${afterCount}`);

  // Test conflict resolution
  await memory.remember({ type: "decision", content: "We've switched to PostgreSQL with pgvector instead of MongoDB for production storage.", importance: 0.95 });
  // should supersede any conflicting? Check statuses
  const all = await store.listMemories(memory.project.id);
  console.log("Test 6 - Conflict handling: memories", all.map(m => `${m.content.slice(0,30)} [${m.status}]`).join(" | "));

  // Test token budgeting with many memories
  for (let i = 0; i < 20; i++) {
    await memory.remember({ content: `Fact ${i}: Lorem ipsum dolor sit amet consectetur adipiscing elit.`.repeat(5), importance: 0.5 });
  }
  const bigCtx = await memory.context({ query: "Fact", maxTokens: 100 });
  console.log("Test 7 - Token budgeting:", bigCtx.tokenCount <= 100 ? "PASS" : "FAIL", `tokens=${bigCtx.tokenCount} limit=100`);

  // Test Sqlite store (node:sqlite)
  console.log("\n=== SQLite Store Test ===");
  const sqliteStore = new SqliteMemoryStore({ path: ":memory:" });
  const sqliteMemory = await Memory.create({ project: "sqlite-test", store: sqliteStore, embeddingProvider: embed });
  await sqliteMemory.remember({ content: "SQLite test memory with PostgreSQL pgvector", importance: 0.9 });
  const sqliteSearch = await sqliteMemory.search("PostgreSQL");
  console.log("SQLite search:", sqliteSearch[0]?.memory.content.includes("PostgreSQL") ? "PASS" : "FAIL");
  await sqliteStore.close();

  // Test goldfish & cross-project leakage eval
  console.log("\n=== Evaluation Tests ===");
  const evalStore = new InMemoryStore();
  const projA = await Memory.create({ project: "project-a", store: evalStore, embeddingProvider: embed });
  const projB = await Memory.create({ project: "project-b", store: evalStore, embeddingProvider: embed });
  await projA.remember({ content: "We use PostgreSQL.", importance: 0.9 });
  await projB.remember({ content: "We use MongoDB.", importance: 0.9 });
  const queryA = await projA.search("What database do we use?");
  console.log("Goldfish cross-project:", queryA[0]?.memory.content.includes("PostgreSQL") ? "PASS" : "FAIL", "->", queryA[0]?.memory.content);
  console.log("Cross-project leakage (should be 0):", queryA.some(r => r.memory.content.includes("MongoDB")) ? "FAIL" : "PASS");

  console.log("\n=== All MVP tests completed ===");
}

runTests().catch(e => { console.error(e); process.exit(1); });
