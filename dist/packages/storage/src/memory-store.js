/**
 * Pure in-memory store — zero dependencies, ideal for tests.
 */
export class InMemoryStore {
    projects = new Map();
    projectsByName = new Map();
    sources = new Map();
    memories = new Map();
    embeddings = new Map();
    retrievals = [];
    async createProject(project) {
        this.projects.set(project.id, project);
        this.projectsByName.set(project.name, project);
        return project;
    }
    async getProject(id) {
        return this.projects.get(id) ?? null;
    }
    async getProjectByName(name) {
        return this.projectsByName.get(name) ?? null;
    }
    async listProjects() {
        return [...this.projects.values()];
    }
    async deleteProject(projectId) {
        const p = this.projects.get(projectId);
        if (p)
            this.projectsByName.delete(p.name);
        this.projects.delete(projectId);
        for (const [id, m] of this.memories)
            if (m.projectId === projectId)
                this.memories.delete(id);
    }
    async createSource(source) {
        this.sources.set(source.id, source);
        return source;
    }
    async getSource(id) {
        return this.sources.get(id) ?? null;
    }
    async createMemory(memory) {
        this.memories.set(memory.id, memory);
    }
    async getMemory(id) {
        return this.memories.get(id) ?? null;
    }
    async updateMemory(id, update) {
        const existing = this.memories.get(id);
        if (!existing)
            return;
        this.memories.set(id, { ...existing, ...update, id, updatedAt: update.updatedAt ?? new Date() });
    }
    async deleteMemory(id) {
        this.memories.delete(id);
    }
    async archiveMemory(id) {
        const m = this.memories.get(id);
        if (m)
            this.memories.set(id, { ...m, archived: true, status: "archived", updatedAt: new Date() });
    }
    async listMemories(projectId) {
        return [...this.memories.values()].filter((m) => m.projectId === projectId).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }
    async search(query) {
        let candidates = [...this.memories.values()].filter((m) => m.projectId === query.projectId);
        if (query.types?.length)
            candidates = candidates.filter((m) => query.types.includes(m.type));
        if (query.minImportance !== undefined)
            candidates = candidates.filter((m) => m.importance >= query.minImportance);
        if (!query.includeArchived)
            candidates = candidates.filter((m) => !m.archived && m.status !== "archived");
        const qLower = query.query.toLowerCase();
        const qTokens = new Set(qLower.split(/\W+/).filter(Boolean));
        const scored = candidates.map((m) => {
            const cLower = m.content.toLowerCase();
            const cTokens = cLower.split(/\W+/).filter(Boolean);
            let hits = 0;
            for (const t of cTokens)
                if (qTokens.has(t))
                    hits++;
            const phraseBoost = cLower.includes(qLower) ? 0.5 : 0;
            const keywordScore = qTokens.size ? Math.min(1, hits / qTokens.size + phraseBoost) : 0;
            const recency = Math.exp(-(Date.now() - m.updatedAt.getTime()) / (1000 * 60 * 60 * 24 * 30));
            const final = keywordScore * 0.7 + m.importance * 0.15 + recency * 0.15;
            return { memory: m, score: final, semanticScore: 0, keywordScore };
        });
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, query.limit ?? 5);
    }
    async upsertEmbedding(memoryId, vector, model) {
        this.embeddings.set(memoryId, { vector, model });
    }
    async getEmbedding(memoryId) {
        return this.embeddings.get(memoryId) ?? null;
    }
    async deleteEmbedding(memoryId) {
        this.embeddings.delete(memoryId);
    }
    async logRetrieval(event) {
        this.retrievals.push(event);
    }
    async listRetrievals(projectId, limit = 20) {
        return this.retrievals.filter((r) => r.projectId === projectId).slice(-limit).reverse();
    }
    async close() { }
}
//# sourceMappingURL=memory-store.js.map