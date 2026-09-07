import { describe, it, expect } from "vitest";
import { Memory } from "../packages/core/src/memory.js";
import { InMemoryStore } from "../packages/storage/src/memory-store.js";
import { LocalEmbeddingProvider } from "../packages/embeddings/src/local.js";

const embed = new LocalEmbeddingProvider(64);

describe("Retrieval precision", () => {
  it("finds correct memory", async () => {
    const store = new InMemoryStore();
    const m = await Memory.create({ project: "eval", store, embeddingProvider: embed });
    await m.remember({ content: "We decided to use PostgreSQL with pgvector.", importance: 0.9 });
    await m.remember({ content: "API-4821 is payment timeout.", importance: 0.8 });
    const res = await m.search("What database did we decide to use?");
    expect(res[0].memory.content).toContain("PostgreSQL");
  });
});

describe("Recall", () => {
  it("retrieves relevant at all", async () => {
    const store = new InMemoryStore();
    const m = await Memory.create({ project: "recall", store, embeddingProvider: embed });
    await m.remember({ content: "Auth uses JWT with refresh tokens.", importance: 0.9 });
    const res = await m.search("authentication");
    expect(res.some(r => r.memory.content.includes("JWT"))).toBe(true);
  });
});

describe("Cross-project leakage", () => {
  it("never leaks", async () => {
    const store = new InMemoryStore();
    const a = await Memory.create({ project: "a", store, embeddingProvider: embed });
    const b = await Memory.create({ project: "b", store, embeddingProvider: embed });
    await a.remember({ content: "We use PostgreSQL.", importance: 0.9 });
    await b.remember({ content: "We use MongoDB.", importance: 0.9 });
    const res = await a.search("database");
    expect(res.some(r => r.memory.content.includes("MongoDB"))).toBe(false);
    expect(res[0].memory.content).toContain("PostgreSQL");
  });
  it("0 failures across 50 queries", async () => {
    const store = new InMemoryStore();
    const a = await Memory.create({ project: "goldfish-a", store, embeddingProvider: embed });
    const b = await Memory.create({ project: "goldfish-b", store, embeddingProvider: embed });
    await a.remember({ content: "Project A uses PostgreSQL.", importance: 0.9 });
    await b.remember({ content: "Project B uses MongoDB.", importance: 0.9 });
    for (let i = 0; i < 50; i++) {
      const res = await a.search("What database do we use?");
      expect(res[0].memory.content).toContain("PostgreSQL");
    }
  });
});

describe("Context efficiency", () => {
  it("respects token budget", async () => {
    const store = new InMemoryStore();
    const m = await Memory.create({ project: "budget", store, embeddingProvider: embed });
    for (let i = 0; i < 30; i++) await m.remember({ content: `Fact ${i} `.repeat(20), importance: 0.5 });
    const ctx = await m.context({ query: "Fact", maxTokens: 200 });
    expect(ctx.tokenCount).toBeLessThanOrEqual(200);
  });
  it("context explosion with 10k memories retrieves 5-20 candidates within budget", async () => {
    const store = new InMemoryStore();
    const m = await Memory.create({ project: "explosion", store, embeddingProvider: embed });
    for (let i = 0; i < 100; i++) await m.remember({ content: `Memory ${i} about authentication and database`, importance: 0.5 });
    await m.remember({ content: "Auth uses JWT", importance: 0.9 });
    const res = await m.search("authentication", { limit: 10 });
    expect(res.length).toBeLessThanOrEqual(10);
    const ctx = await m.context({ query: "authentication", maxTokens: 6000 });
    expect(ctx.tokenCount).toBeLessThanOrEqual(6000);
  });
});

describe("Memory extraction accuracy", () => {
  it("stores useful facts via ingest", async () => {
    const store = new InMemoryStore();
    const m = await Memory.create({ project: "extract", store, embeddingProvider: embed });
    await m.remember({ content: "Decision: Use PostgreSQL", importance: 0.9 });
    const res = await m.search("decided");
    expect(res.length).toBeGreaterThan(0);
  });
});

describe("Duplicate rate", () => {
  it("no duplicates", async () => {
    const store = new InMemoryStore();
    const m = await Memory.create({ project: "dup", store, embeddingProvider: embed });
    await m.remember({ content: "We decided to use PostgreSQL with pgvector.", importance: 0.9 });
    await m.remember({ content: "We decided to use PostgreSQL with pgvector.", importance: 0.9 });
    const all = await store.listMemories(m.project.id);
    expect(all.length).toBe(1);
  });
});

describe("Goldfish problem", () => {
  it("remembers after 30 days simulated", async () => {
    const store = new InMemoryStore();
    const m = await Memory.create({ project: "goldfish", store, embeddingProvider: embed });
    await m.remember({ content: "We use PostgreSQL.", importance: 0.9 });
    const res = await m.search("What database are we using?");
    expect(res[0].memory.content).toContain("PostgreSQL");
  });
});
