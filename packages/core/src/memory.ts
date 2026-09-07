import { randomUUID } from "node:crypto";
import {
  CreateMemoryInputSchema,
  type CreateMemoryInput,
  type ContextOptions,
  type ContextResult,
  type Memory as MemoryRecord,
  type MemoryType,
  type SearchResult,
} from "./types.js";
import type { MemoryStore } from "./memory-store.js";
import type { EmbeddingProvider } from "../../embeddings/src/provider.js";
import { HybridRanker } from "../../retrieval/src/ranker.js";
import { estimateTokens } from "../../retrieval/src/token.js";
import { MemoryEvents } from "./events.js";
import { resolvePolicy, isSensitive, type MemoryPolicy } from "./policy.js";
import { Consolidator } from "./consolidation.js";
import type { ExtractorProvider } from "./extraction.js";
import { cosineSimilarity } from "../../embeddings/src/provider.js";

export interface MemoryCreateOptions {
  project: string; // name or id
  store?: MemoryStore;
  embeddingProvider?: EmbeddingProvider;
  extractor?: ExtractorProvider;
  policy?: MemoryPolicy;
}

export type MemoryLifecycle = "extracted" | "candidate" | "validated" | "stored" | "retrieved" | "updated" | "archived";

export class MemoryEngine {
  private store: MemoryStore;
  private projectId: string;
  private projectName: string;
  private embeddingProvider?: EmbeddingProvider;
  private extractor?: ExtractorProvider;
  private policy: ReturnType<typeof resolvePolicy>;
  public readonly events = new MemoryEvents();
  private ranker: HybridRanker;
  private consolidator: Consolidator;

  private constructor(opts: { store: MemoryStore; projectId: string; projectName: string; embeddingProvider?: EmbeddingProvider; extractor?: ExtractorProvider; policy?: MemoryPolicy; ranker?: HybridRanker }) {
    this.store = opts.store;
    this.projectId = opts.projectId;
    this.projectName = opts.projectName;
    this.embeddingProvider = opts.embeddingProvider;
    this.extractor = opts.extractor;
    this.policy = resolvePolicy(opts.policy);
    this.ranker = opts.ranker ?? new HybridRanker();
    this.consolidator = new Consolidator(this.store, this.embeddingProvider);
  }

  static async create(opts: MemoryCreateOptions): Promise<MemoryEngine> {
    const store: MemoryStore = (opts.store as MemoryStore) ?? (await import("../../storage/src/config.js").then(m => m.createStoreFromConfig(m.resolveStorageConfig())));
    let project = await store.getProjectByName(opts.project);
    if (!project) {
      project = await store.getProject(opts.project);
    }
    if (!project) {
      const now = new Date();
      const p = { id: randomUUID(), name: opts.project, createdAt: now, updatedAt: now };
      await store.createProject(p);
      project = p;
    }
    return new MemoryEngine({
      store,
      projectId: project.id,
      projectName: project.name,
      embeddingProvider: opts.embeddingProvider,
      extractor: opts.extractor,
      policy: opts.policy,
    });
  }

  get project() {
    return { id: this.projectId, name: this.projectName };
  }

  // ---------- Ingest / Remember ----------

  on<K extends Parameters<MemoryEvents["on"]>[0]>(event: K, listener: Parameters<MemoryEvents["on"]>[1]): this {
    this.events.on(event as any, listener as any);
    return this;
  }

  async remember(input: Partial<CreateMemoryInput> & { content: string; type?: MemoryType }): Promise<MemoryRecord> {
    const parsed = CreateMemoryInputSchema.parse(input);
    // Policy checks — minimumImportance applies only to auto-extracted memories; manual remember always allowed
    if (!this.policy.storeSensitiveData && isSensitive(parsed.content)) {
      throw new Error("Refusing to store sensitive data (policy.storeSensitiveData=false)");
    }
    if (this.policy.shouldRemember) {
      const allowed = await this.policy.shouldRemember({
        projectId: this.projectId,
        type: parsed.type,
        content: parsed.content,
        importance: parsed.importance,
        confidence: parsed.confidence,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
        accessCount: 0,
        metadata: parsed.metadata,
        archived: false,
      } as any);
      if (!allowed) throw new Error("Policy shouldRemember returned false");
    }
    const count = (await this.store.listMemories(this.projectId)).filter((m) => !m.archived).length;
    if (count >= this.policy.maxMemoriesPerProject) {
      throw new Error(`maxMemoriesPerProject ${this.policy.maxMemoriesPerProject} reached`);
    }
    const now = new Date();
    const mem: MemoryRecord = {
      id: randomUUID(),
      projectId: this.projectId,
      type: parsed.type,
      content: parsed.content,
      importance: parsed.importance,
      confidence: parsed.confidence,
      status: "active",
      createdAt: now,
      updatedAt: now,
      accessCount: 0,
      sourceId: parsed.sourceId,
      metadata: parsed.metadata,
      archived: false,
    };

    // Deduplication: keyword similarity check against existing memories
    const existing = await this.store.listMemories(this.projectId);
    for (const e of existing) {
      if (e.archived || e.status === "superseded") continue;
      if (this.isNearDuplicate(e.content, mem.content)) {
        // update existing instead of creating new
        await this.store.updateMemory(e.id, {
          content: mem.content,
          importance: Math.max(e.importance, mem.importance),
          updatedAt: now,
          accessCount: e.accessCount,
        });
        if (this.embeddingProvider) {
          const vec = await this.embeddingProvider.embed(mem.content);
          await this.store.upsertEmbedding(e.id, vec, this.embeddingProvider.model);
        }
        const updated = await this.store.getMemory(e.id);
        return updated!;
      }
    }

    // Conflict detection (simple): if embedding similarity high but content contradicts via keyword overlap low? fallback to string includes
    // For MVP: if we detect "switched to" / "migrated" / "instead of", supersede previous conflicting memory
    await this.maybeSupersedeConflicting(mem);

    await this.store.createMemory(mem);

    if (this.embeddingProvider) {
      const vec = await this.embeddingProvider.embed(mem.content);
      await this.store.upsertEmbedding(mem.id, vec, this.embeddingProvider.model);
      mem.embedding = vec;
    }

    this.events.emit("memory.created", mem);
    return mem;
  }

  /** ingest raw conversation — stores source + auto-extracts if policy/extractor configured */
  async ingest(input: { role: string; content: string; sourceType?: "conversation" | "document" | "tool" | "manual" }): Promise<{ sourceId: string; extracted?: MemoryRecord[] }> {
    const sourceId = randomUUID();
    await this.store.createSource({
      id: sourceId,
      projectId: this.projectId,
      type: input.sourceType ?? "conversation",
      content: `${input.role}: ${input.content}`,
      createdAt: new Date(),
      metadata: { role: input.role },
    });
    if (this.policy.autoExtract && this.extractor) {
      const extracted = await this.extractor.extract(input.content);
      const memories: MemoryRecord[] = [];
      for (const e of extracted) {
        if (e.importance < this.policy.minimumImportance) continue;
        try {
          const m = await this.remember({ type: e.type, content: e.content, importance: e.importance, confidence: e.confidence, sourceId, metadata: { autoExtracted: true } });
          memories.push(m);
        } catch {}
      }
      if (!this.policy.retainConversations) {
        // optionally delete source after extraction — keep for traceability if needed
      }
      return { sourceId, extracted: memories };
    }
    return { sourceId };
  }

  // ---------- Search ----------

  async search(query: string, opts?: { limit?: number; types?: MemoryType[]; minImportance?: number }): Promise<SearchResult[]> {
    const limit = opts?.limit ?? 5;

    // If we have embeddings, do semantic + keyword hybrid; else keyword fallback via store.search
    if (this.embeddingProvider) {
      const qVec = await this.embeddingProvider.embed(query);

      // Prefer native pgvector search if available (faster, uses HNSW index)
      if (this.store.vectorSearch) {
        try {
          const vectorResults = await this.store.vectorSearch(this.projectId, qVec, limit * 3);
          const withVectors = vectorResults
            .filter(({ memory }) => !memory.archived && memory.status !== "archived")
            .filter(({ memory }) => !opts?.types || opts.types.includes(memory.type))
            .filter(({ memory }) => opts?.minImportance === undefined || memory.importance >= opts.minImportance)
            .map(({ memory, distance }) => ({ ...memory, _vec: undefined as any, _distance: distance }));
          // Hybrid rank still applies keyword+importance+recency on top of vector distance
          const candidates = this.ranker.rank(withVectors as any, query, qVec);
          const top = candidates.slice(0, limit);
          for (const c of top) {
            await this.store.updateMemory(c.memory.id, { lastAccessedAt: new Date(), accessCount: c.memory.accessCount + 1 });
          }
          const eventId = randomUUID();
          const scores: Record<string, number> = {};
          top.forEach((r) => (scores[r.memory.id] = r.score));
          const retrievalEvent = { id: eventId, projectId: this.projectId, query, retrievedMemoryIds: top.map((r) => r.memory.id), scores, finalContextTokens: estimateTokens(top.map((r) => r.memory.content).join("\n")), createdAt: new Date() };
          await this.store.logRetrieval(retrievalEvent);
          this.events.emit("retrieval.completed", retrievalEvent);
          this.events.emit("memory.retrieved", top.map((r) => r.memory) as any, query);
          return top.map((r) => ({ memory: r.memory, score: r.score, semanticScore: r.semanticScore, keywordScore: r.keywordScore }));
        } catch {
          // fallback to JS ranking
        }
      }

      const all = await this.store.listMemories(this.projectId);
      const withEmbeddings: Array<MemoryRecord & { _vec?: number[] }> = [];
      for (const m of all) {
        if (m.archived || m.status === "archived") continue;
        if (opts?.types && !opts.types.includes(m.type)) continue;
        if (opts?.minImportance !== undefined && m.importance < opts.minImportance) continue;
        const emb = await this.store.getEmbedding(m.id);
        withEmbeddings.push({ ...m, _vec: emb?.vector });
      }

      // rank via HybridRanker (semantic cosine + keyword + importance + recency)
      const candidates = this.ranker.rank(withEmbeddings as any, query, qVec);
      const top = candidates.slice(0, limit);

      // update access counts
      for (const c of top) {
        await this.store.updateMemory(c.memory.id, {
          lastAccessedAt: new Date(),
          accessCount: c.memory.accessCount + 1,
        });
      }

      // log retrieval
      const eventId = randomUUID();
      const scores: Record<string, number> = {};
      top.forEach((r) => (scores[r.memory.id] = r.score));
      const retrievalEvent = {
        id: eventId,
        projectId: this.projectId,
        query,
        retrievedMemoryIds: top.map((r) => r.memory.id),
        scores,
        finalContextTokens: estimateTokens(top.map((r) => r.memory.content).join("\n")),
        createdAt: new Date(),
      };
      await this.store.logRetrieval(retrievalEvent);
      this.events.emit("retrieval.completed", retrievalEvent);
      this.events.emit("memory.retrieved", top.map((r) => r.memory) as any, query);

      return top.map((r) => ({
        memory: r.memory,
        score: r.score,
        semanticScore: r.semanticScore,
        keywordScore: r.keywordScore,
      }));
    }

    // fallback: store's keyword search
    const results = await this.store.search({
      projectId: this.projectId,
      query,
      types: opts?.types,
      limit,
      minImportance: opts?.minImportance,
    });
    for (const r of results) {
      await this.store.updateMemory(r.memory.id, {
        lastAccessedAt: new Date(),
        accessCount: r.memory.accessCount + 1,
      });
    }
    return results;
  }

  // ---------- Context ----------

  async context(opts: ContextOptions): Promise<ContextResult>;
  async context(query: string): Promise<ContextResult>;
  async context(opts: string | ContextOptions): Promise<ContextResult> {
    const q = typeof opts === "string" ? opts : opts.query;
    const maxTokens = typeof opts === "string" ? 6000 : (opts.maxTokens ?? 6000);
    const limit = typeof opts === "string" ? 5 : (opts.limit ?? 10);
    const types = typeof opts === "string" ? undefined : opts.types;

    const results = await this.search(q, { limit, types });
    // token budgeting: greedily add until maxTokens
    const memories: MemoryRecord[] = [];
    let tokenCount = 0;
    const header = `Relevant project memory (${this.projectName}):\n`;
    tokenCount += estimateTokens(header);
    let text = header;

    for (const r of results) {
      const chunk = `- ${r.memory.content}\n`;
      const chunkTokens = estimateTokens(chunk);
      if (tokenCount + chunkTokens > maxTokens) break;
      memories.push(r.memory as any);
      text += chunk;
      tokenCount += chunkTokens;
    }

    if (memories.length === 0) {
      text = "";
      tokenCount = 0;
    }

    return {
      memories,
      text,
      tokenCount,
      sources: [...new Set(memories.map((m: any) => m.sourceId).filter(Boolean))] as string[],
    };
  }

  // alias
  buildContext(opts: ContextOptions) {
    return this.context(opts);
  }

  // ---------- Lifecycle ----------

  async forget(id: string): Promise<void> {
    const mem = await this.store.getMemory(id);
    await this.store.deleteMemory(id);
    // Embeddings contain derived data — ensure deleted (store cascade handles it, but explicit for InMemory)
    try { await (this.store as any).deleteEmbedding?.(id); } catch {}
    this.events.emit("memory.deleted", id);
    if (mem) this.events.emit("memory.archived", mem);
  }

  async forgetProject(projectId?: string): Promise<void> {
    const pid = projectId ?? this.projectId;
    const memories = await this.store.listMemories(pid);
    for (const m of memories) await this.store.deleteMemory(m.id);
    await this.store.deleteProject(pid);
  }

  async archive(id: string): Promise<void> {
    await this.store.archiveMemory(id);
    const mem = await this.store.getMemory(id);
    if (mem) this.events.emit("memory.archived", mem);
  }

  async deleteProject(): Promise<void> {
    await this.forgetProject(this.projectId);
  }

  async export(filter?: { includeArchived?: boolean }): Promise<{ project: { id: string; name: string }; memories: MemoryRecord[] }> {
    let memories = await this.store.listMemories(this.projectId);
    if (!filter?.includeArchived) memories = memories.filter((m) => !m.archived);
    return { project: { id: this.projectId, name: this.projectName }, memories };
  }

  async consolidate(opts?: { threshold?: number; minClusterSize?: number }) {
    const results = await this.consolidator.consolidate(this.projectId, opts);
    for (const r of results) this.events.emit("consolidation.completed", r.summary, r.sourceIds);
    return results;
  }

  async updateMemory(id: string, update: Partial<MemoryRecord>): Promise<void> {
    await this.store.updateMemory(id, update);
    const mem = await this.store.getMemory(id);
    if (mem) this.events.emit("memory.updated", mem);
    if (update.content && this.embeddingProvider && mem) {
      const vec = await this.embeddingProvider.embed(mem.content);
      await this.store.upsertEmbedding(id, vec, this.embeddingProvider.model);
    }
  }

  // ---------- Helpers ----------

  private isNearDuplicate(a: string, b: string): boolean {
    const norm = (s: string) => s.toLowerCase().replace(/\W+/g, " ").trim();
    const na = norm(a), nb = norm(b);
    if (na === nb) return true;
    // Jaccard over tokens threshold 0.85
    const sa = new Set(na.split(" "));
    const sb = new Set(nb.split(" "));
    const inter = [...sa].filter((x) => sb.has(x)).length;
    const union = new Set([...sa, ...sb]).size;
    return union > 0 && inter / union > 0.85;
  }

  private async maybeSupersedeConflicting(newMem: MemoryRecord): Promise<void> {
    const triggers = ["switched to", "migrated to", "changed to", "instead of", "no longer", "replaced", "now using", "moved to"];
    const lower = newMem.content.toLowerCase();
    const triggered = triggers.some((t) => lower.includes(t));
    const existing = await this.store.listMemories(this.projectId);
    const newTokens = new Set(lower.split(/\W+/).filter(Boolean));

    // Embedding-aware conflict: if semantic similarity high but content contradicts
    let newVec: number[] | null = null;
    if (this.embeddingProvider) {
      try { newVec = await this.embeddingProvider.embed(newMem.content); } catch {}
    }

    for (const e of existing) {
      if (e.archived || e.status !== "active") continue;
      const overlap = e.content.toLowerCase().split(/\W+/).filter((w) => newTokens.has(w)).length;
      let shouldSupersede = false;

      if (triggered && overlap >= 2 && !this.isNearDuplicate(e.content, newMem.content)) {
        const nouns = ["database", "postgres", "mongodb", "sqlite", "storage", "backend", "auth", "payment", "api", "framework"];
        const sharesNoun = nouns.some((n) => e.content.toLowerCase().includes(n) && lower.includes(n));
        if (sharesNoun) shouldSupersede = true;
      }

      // Embedding similarity conflict: high similarity (>0.82) but not duplicate -> likely same topic updated
      if (!shouldSupersede && newVec && triggered) {
        const emb = await this.store.getEmbedding(e.id);
        if (emb) {
          const sim = cosineSimilarity(newVec, emb.vector);
          if (sim > 0.82 && !this.isNearDuplicate(e.content, newMem.content)) shouldSupersede = true;
        }
      }

      if (shouldSupersede) {
        await this.store.updateMemory(e.id, { status: "superseded", archived: false, updatedAt: new Date() });
        this.events.emit("memory.superseded", e, newMem);
      }
    }
  }
}

// Convenience alias per spec: `Memory` class
export const Memory = MemoryEngine;
