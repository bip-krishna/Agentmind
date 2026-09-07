import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
export class SqliteMemoryStore {
    db;
    constructor(opts = {}) {
        const dbPath = opts.path ?? ":memory:";
        if (dbPath !== ":memory:") {
            const dir = path.dirname(dbPath);
            if (dir && dir !== "." && dir !== "")
                fs.mkdirSync(dir, { recursive: true });
        }
        this.db = new DatabaseSync(dbPath);
        this.migrate();
    }
    migrate() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        content TEXT,
        created_at TEXT NOT NULL,
        metadata TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        importance REAL NOT NULL,
        confidence REAL NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_accessed_at TEXT,
        access_count INTEGER NOT NULL,
        source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
        metadata TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS embeddings (
        memory_id TEXT PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
        vector TEXT NOT NULL,
        model TEXT NOT NULL,
        dimensions INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS retrieval_events (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        query TEXT NOT NULL,
        retrieved_memory_ids TEXT NOT NULL,
        scores TEXT NOT NULL,
        final_context_tokens INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_id);
      CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
      CREATE TABLE IF NOT EXISTS consolidations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        summary_memory_id TEXT REFERENCES memories(id) ON DELETE SET NULL,
        source_memory_ids TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status);
    `);
    }
    // ---- Projects ----
    async createProject(project) {
        this.db.prepare(`INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`).run(project.id, project.name, project.description ?? null, project.createdAt.toISOString(), project.updatedAt.toISOString());
        return project;
    }
    async getProject(id) {
        const row = this.db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
        if (!row)
            return null;
        return this.mapProject(row);
    }
    async getProjectByName(name) {
        const row = this.db.prepare(`SELECT * FROM projects WHERE name = ?`).get(name);
        if (!row)
            return null;
        return this.mapProject(row);
    }
    async listProjects() {
        const rows = this.db.prepare(`SELECT * FROM projects`).all();
        return rows.map(this.mapProject);
    }
    async deleteProject(projectId) {
        this.db.prepare(`DELETE FROM projects WHERE id = ?`).run(projectId);
    }
    // ---- Sources ----
    async createSource(source) {
        this.db.prepare(`INSERT INTO sources (id, project_id, type, content, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?)`).run(source.id, source.projectId, source.type, source.content ?? null, source.createdAt.toISOString(), JSON.stringify(source.metadata));
        return source;
    }
    async getSource(id) {
        const row = this.db.prepare(`SELECT * FROM sources WHERE id = ?`).get(id);
        if (!row)
            return null;
        return {
            id: row.id,
            projectId: row.project_id,
            type: row.type,
            content: row.content ?? undefined,
            createdAt: new Date(row.created_at),
            metadata: JSON.parse(row.metadata),
        };
    }
    // ---- Memories ----
    async createMemory(memory) {
        this.db.prepare(`
      INSERT INTO memories (id, project_id, type, content, importance, confidence, status, created_at, updated_at, last_accessed_at, access_count, source_id, metadata, archived)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(memory.id, memory.projectId, memory.type, memory.content, memory.importance, memory.confidence ?? 1, memory.status ?? "active", memory.createdAt.toISOString(), memory.updatedAt.toISOString(), memory.lastAccessedAt ? memory.lastAccessedAt.toISOString() : null, memory.accessCount, memory.sourceId ?? null, JSON.stringify(memory.metadata), memory.archived ? 1 : 0);
    }
    async getMemory(id) {
        const row = this.db.prepare(`SELECT * FROM memories WHERE id = ?`).get(id);
        if (!row)
            return null;
        return this.mapMemory(row);
    }
    async updateMemory(id, update) {
        const existing = await this.getMemory(id);
        if (!existing)
            return;
        const merged = { ...existing, ...update, id, updatedAt: update.updatedAt ?? new Date() };
        this.db.prepare(`
      UPDATE memories SET type=?, content=?, importance=?, confidence=?, status=?, created_at=?, updated_at=?, last_accessed_at=?, access_count=?, source_id=?, metadata=?, archived=?
      WHERE id=?
    `).run(merged.type, merged.content, merged.importance, merged.confidence, (merged.status ?? "active"), merged.createdAt.toISOString(), merged.updatedAt.toISOString(), merged.lastAccessedAt ? merged.lastAccessedAt.toISOString() : null, merged.accessCount, merged.sourceId ?? null, JSON.stringify(merged.metadata), merged.archived ? 1 : 0, id);
    }
    async deleteMemory(id) {
        this.db.prepare(`DELETE FROM memories WHERE id = ?`).run(id);
    }
    async archiveMemory(id) {
        this.db.prepare(`UPDATE memories SET archived=1, status='archived', updated_at=? WHERE id=?`).run(new Date().toISOString(), id);
    }
    async listMemories(projectId) {
        const rows = this.db.prepare(`SELECT * FROM memories WHERE project_id = ? ORDER BY updated_at DESC`).all(projectId);
        return rows.map(this.mapMemory);
    }
    async search(query) {
        let sql = `SELECT * FROM memories WHERE project_id = ?`;
        const params = [query.projectId];
        if (query.types && query.types.length) {
            sql += ` AND type IN (${query.types.map(() => "?").join(",")})`;
            params.push(...query.types);
        }
        if (query.minImportance !== undefined) {
            sql += ` AND importance >= ?`;
            params.push(query.minImportance);
        }
        if (!query.includeArchived) {
            sql += ` AND archived = 0 AND status != 'archived'`;
        }
        const rows = this.db.prepare(sql).all(...params);
        const memories = rows.map(this.mapMemory);
        const qLower = query.query.toLowerCase();
        const qTokens = new Set(qLower.split(/\W+/).filter(Boolean));
        const scored = memories.map((m) => {
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
    // ---- Embeddings ----
    async upsertEmbedding(memoryId, vector, model) {
        this.db.prepare(`INSERT INTO embeddings (memory_id, vector, model, dimensions) VALUES (?, ?, ?, ?)
      ON CONFLICT(memory_id) DO UPDATE SET vector=excluded.vector, model=excluded.model, dimensions=excluded.dimensions
    `).run(memoryId, JSON.stringify(vector), model, vector.length);
    }
    async getEmbedding(memoryId) {
        const row = this.db.prepare(`SELECT * FROM embeddings WHERE memory_id = ?`).get(memoryId);
        if (!row)
            return null;
        return { vector: JSON.parse(row.vector), model: row.model };
    }
    async deleteEmbedding(memoryId) {
        this.db.prepare(`DELETE FROM embeddings WHERE memory_id = ?`).run(memoryId);
    }
    // ---- Retrieval logs ----
    async logRetrieval(event) {
        this.db.prepare(`INSERT INTO retrieval_events (id, project_id, query, retrieved_memory_ids, scores, final_context_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(event.id, event.projectId, event.query, JSON.stringify(event.retrievedMemoryIds), JSON.stringify(event.scores), event.finalContextTokens, event.createdAt.toISOString());
    }
    async listRetrievals(projectId, limit = 20) {
        const rows = this.db.prepare(`SELECT * FROM retrieval_events WHERE project_id = ? ORDER BY created_at DESC LIMIT ?`).all(projectId, limit);
        return rows.map((r) => ({
            id: r.id,
            projectId: r.project_id,
            query: r.query,
            retrievedMemoryIds: JSON.parse(r.retrieved_memory_ids),
            scores: JSON.parse(r.scores),
            finalContextTokens: r.final_context_tokens,
            createdAt: new Date(r.created_at),
        }));
    }
    async close() {
        this.db.close();
    }
    mapProject = (row) => ({
        id: row.id,
        name: row.name,
        description: row.description ?? undefined,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
    });
    mapMemory = (row) => ({
        id: row.id,
        projectId: row.project_id,
        type: row.type,
        content: row.content,
        importance: row.importance,
        confidence: row.confidence,
        status: row.status,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        lastAccessedAt: row.last_accessed_at ? new Date(row.last_accessed_at) : undefined,
        accessCount: row.access_count,
        sourceId: row.source_id ?? undefined,
        metadata: JSON.parse(row.metadata),
        archived: !!row.archived,
    });
}
//# sourceMappingURL=sqlite-store.js.map