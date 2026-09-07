import type { MemoryStore } from "../../core/src/memory-store.js";
import type { Memory, Project, Source, SearchQuery, SearchResult, RetrievalEvent } from "../../core/src/types.js";

/**
 * Pure in-memory store — zero dependencies, ideal for tests.
 */
export class InMemoryStore implements MemoryStore {
  private projects = new Map<string, Project>();
  private projectsByName = new Map<string, Project>();
  private sources = new Map<string, Source>();
  private memories = new Map<string, Memory>();
  private embeddings = new Map<string, { vector: number[]; model: string }>();
  private retrievals: RetrievalEvent[] = [];

  async createProject(project: Project): Promise<Project> {
    this.projects.set(project.id, project);
    this.projectsByName.set(project.name, project);
    return project;
  }
  async getProject(id: string): Promise<Project | null> {
    return this.projects.get(id) ?? null;
  }
  async getProjectByName(name: string): Promise<Project | null> {
    return this.projectsByName.get(name) ?? null;
  }
  async listProjects(): Promise<Project[]> {
    return [...this.projects.values()];
  }
  async deleteProject(projectId: string): Promise<void> {
    const p = this.projects.get(projectId);
    if (p) this.projectsByName.delete(p.name);
    this.projects.delete(projectId);
    for (const [id, m] of this.memories) if (m.projectId === projectId) this.memories.delete(id);
  }
  async createSource(source: Source): Promise<Source> {
    this.sources.set(source.id, source);
    return source;
  }
  async getSource(id: string): Promise<Source | null> {
    return this.sources.get(id) ?? null;
  }
  async createMemory(memory: Memory): Promise<void> {
    this.memories.set(memory.id, memory);
  }
  async getMemory(id: string): Promise<Memory | null> {
    return this.memories.get(id) ?? null;
  }
  async updateMemory(id: string, update: Partial<Memory>): Promise<void> {
    const existing = this.memories.get(id);
    if (!existing) return;
    this.memories.set(id, { ...existing, ...update, id, updatedAt: update.updatedAt ?? new Date() } as Memory);
  }
  async deleteMemory(id: string): Promise<void> {
    this.memories.delete(id);
  }
  async archiveMemory(id: string): Promise<void> {
    const m = this.memories.get(id);
    if (m) this.memories.set(id, { ...m, archived: true, status: "archived", updatedAt: new Date() });
  }
  async listMemories(projectId: string): Promise<Memory[]> {
    return [...this.memories.values()].filter((m) => m.projectId === projectId).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
  async search(query: SearchQuery): Promise<SearchResult[]> {
    let candidates = [...this.memories.values()].filter((m) => m.projectId === query.projectId);
    if (query.types?.length) candidates = candidates.filter((m) => query.types!.includes(m.type));
    if (query.minImportance !== undefined) candidates = candidates.filter((m) => m.importance >= query.minImportance!);
    if (!query.includeArchived) candidates = candidates.filter((m) => !m.archived && m.status !== "archived");
    const qLower = query.query.toLowerCase();
    const qTokens = new Set(qLower.split(/\W+/).filter(Boolean));
    const scored = candidates.map((m) => {
      const cLower = m.content.toLowerCase();
      const cTokens = cLower.split(/\W+/).filter(Boolean);
      let hits = 0;
      for (const t of cTokens) if (qTokens.has(t)) hits++;
      const phraseBoost = cLower.includes(qLower) ? 0.5 : 0;
      const keywordScore = qTokens.size ? Math.min(1, hits / qTokens.size + phraseBoost) : 0;
      const recency = Math.exp(-(Date.now() - m.updatedAt.getTime()) / (1000 * 60 * 60 * 24 * 30));
      const final = keywordScore * 0.7 + m.importance * 0.15 + recency * 0.15;
      return { memory: m, score: final, semanticScore: 0, keywordScore };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, query.limit ?? 5);
  }
  async upsertEmbedding(memoryId: string, vector: number[], model: string): Promise<void> {
    this.embeddings.set(memoryId, { vector, model });
  }
  async getEmbedding(memoryId: string): Promise<{ vector: number[]; model: string } | null> {
    return this.embeddings.get(memoryId) ?? null;
  }
  async deleteEmbedding(memoryId: string): Promise<void> {
    this.embeddings.delete(memoryId);
  }
  async logRetrieval(event: RetrievalEvent): Promise<void> {
    this.retrievals.push(event);
  }
  async listRetrievals(projectId: string, limit = 20): Promise<RetrievalEvent[]> {
    return this.retrievals.filter((r) => r.projectId === projectId).slice(-limit).reverse();
  }
  async close(): Promise<void> {}
}
