import { describe, it, expect } from "vitest";
import { Memory } from "../packages/core/src/memory.js";
import { InMemoryStore } from "../packages/storage/src/memory-store.js";
import { LocalEmbeddingProvider } from "../packages/embeddings/src/local.js";

describe("Consolidation", () => {
  it("1000 -> 150 concept collapses similar", async () => {
    const store = new InMemoryStore();
    const embed = new LocalEmbeddingProvider(32);
    const m = await Memory.create({ project: "consol", store, embeddingProvider: embed });
    for (let i = 0; i < 10; i++) {
      await m.remember({ content: `Payment gateway timeout issue on API-4821 occurrence ${i} with gateway error`, importance: 0.6 });
    }
    const results = await m.consolidate({ threshold: 0.5, minClusterSize: 3 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].summary.type).toBe("summary");
  });
});

describe("Conflict resolution", () => {
  it("supersedes old", async () => {
    const store = new InMemoryStore();
    const m = await Memory.create({ project: "conflict", store, embeddingProvider: new LocalEmbeddingProvider(64) });
    await m.remember({ content: "Database is MongoDB for production", importance: 0.9 });
    await m.remember({ content: "We switched database to PostgreSQL with pgvector instead of MongoDB", importance: 0.95 });
    const all = await store.listMemories(m.project.id);
    const superseded = all.find(x => x.status === "superseded");
    expect(superseded).toBeDefined();
  });
});

describe("Policy & privacy", () => {
  it("refuses sensitive", async () => {
    const store = new InMemoryStore();
    const m = await Memory.create({ project: "privacy", store, policy: { storeSensitiveData: false } });
    await expect(m.remember({ content: "My password is 12345", importance: 0.9 })).rejects.toThrow();
  });
  it("respects maxMemories", async () => {
    const store = new InMemoryStore();
    const m = await Memory.create({ project: "limit", store, policy: { maxMemoriesPerProject: 2 } });
    await m.remember({ content: "a", importance: 0.9 });
    await m.remember({ content: "b", importance: 0.9 });
    await expect(m.remember({ content: "c", importance: 0.9 })).rejects.toThrow();
  });
});
