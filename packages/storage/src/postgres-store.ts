import type { MemoryStore } from "../../core/src/memory-store.js";
import type { Memory, Project, Source, SearchQuery, SearchResult, RetrievalEvent } from "../../core/src/types.js";
import { MIGRATIONS } from "./migrations.js";

/**
 * Postgres + pgvector adapter — same MemoryStore contract as SqliteMemoryStore.
 * Requires: CREATE EXTENSION vector;
 * Embeddings stored dual: JSON text `vector` + native `vec` column for pgvector search.
 */

type PgPool = {
  query: (text: string, params?: any[]) => Promise<{ rows: any[] }>;
  end: () => Promise<void>;
};

export interface PostgresStoreOptions {
  connectionString: string;
  maxPool?: number;
  vectorDimensions?: number; // default 1536
}

export class PostgresMemoryStore implements MemoryStore {
  private pool: PgPool;
  private dimensions: number;
  private ready: Promise<void>;

  constructor(opts: string | PostgresStoreOptions) {
    const connectionString = typeof opts === "string" ? opts : opts.connectionString;
    this.dimensions = typeof opts === "object" ? (opts.vectorDimensions ?? 1536) : 1536;
    // dynamic import to avoid hard dep if not used
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool } = require("pg");
    this.pool = new Pool({ connectionString, max: typeof opts === "object" ? (opts.maxPool ?? 10) : 10 });
    this.ready = this.migrate();
  }

  private async migrate() {
    // schema_migrations + core tables
    for (const m of MIGRATIONS) {
      if (m.version === 2) {
        // pgvector extension + vec column
        try {
          await this.pool.query(`CREATE EXTENSION IF NOT EXISTS vector`);
          await this.pool.query(`ALTER TABLE embeddings ADD COLUMN IF NOT EXISTS vec vector(${this.dimensions})`);
          await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_embeddings_vec ON embeddings USING hnsw (vec vector_cosine_ops)`);
        } catch {
          // ignore if extension not available
        }
        continue;
      }
      // For version 1, run each statement separately for pg
      const stmts = m.up.split(";").map((s) => s.trim()).filter(Boolean);
      for (const stmt of stmts) {
        try { await this.pool.query(stmt); } catch {}
      }
    }
    // Ensure tables exist with pg-compatible types (TEXT -> VARCHAR etc handled)
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        content TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        metadata JSONB NOT NULL
      );
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        importance REAL NOT NULL,
        confidence REAL NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        last_accessed_at TIMESTAMPTZ,
        access_count INTEGER NOT NULL,
        source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
        metadata JSONB NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS embeddings (
        memory_id TEXT PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
        vector TEXT NOT NULL,
        model TEXT NOT NULL,
        dimensions INTEGER NOT NULL,
        vec vector(${this.dimensions})
      );
      CREATE TABLE IF NOT EXISTS retrieval_events (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        query TEXT NOT NULL,
        retrieved_memory_ids JSONB NOT NULL,
        scores JSONB NOT NULL,
        final_context_tokens INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS consolidations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        summary_memory_id TEXT REFERENCES memories(id) ON DELETE SET NULL,
        source_memory_ids JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
    `);
  }

  private async ensureReady() { await this.ready; }

  // ---- Projects ----
  async createProject(project: Project): Promise<Project> {
    await this.ensureReady();
    await this.pool.query(`INSERT INTO projects (id, name, description, created_at, updated_at) VALUES ($1,$2,$3,$4,$5)`, [project.id, project.name, project.description ?? null, project.createdAt, project.updatedAt]);
    return project;
  }
  async getProject(id: string): Promise<Project | null> {
    await this.ensureReady();
    const { rows } = await this.pool.query(`SELECT * FROM projects WHERE id=$1`, [id]);
    if (!rows[0]) return null;
    return this.mapProject(rows[0]);
  }
  async getProjectByName(name: string): Promise<Project | null> {
    await this.ensureReady();
    const { rows } = await this.pool.query(`SELECT * FROM projects WHERE name=$1`, [name]);
    if (!rows[0]) return null;
    return this.mapProject(rows[0]);
  }
  async listProjects(): Promise<Project[]> {
    await this.ensureReady();
    const { rows } = await this.pool.query(`SELECT * FROM projects`);
    return rows.map(this.mapProject);
  }
  async deleteProject(projectId: string): Promise<void> {
    await this.ensureReady();
    await this.pool.query(`DELETE FROM projects WHERE id=$1`, [projectId]);
  }

  // ---- Sources ----
  async createSource(source: Source): Promise<Source> {
    await this.ensureReady();
    await this.pool.query(`INSERT INTO sources (id, project_id, type, content, created_at, metadata) VALUES ($1,$2,$3,$4,$5,$6)`, [source.id, source.projectId, source.type, source.content ?? null, source.createdAt, JSON.stringify(source.metadata)]);
    return source;
  }
  async getSource(id: string): Promise<Source | null> {
    await this.ensureReady();
    const { rows } = await this.pool.query(`SELECT * FROM sources WHERE id=$1`, [id]);
    if (!rows[0]) return null;
    const r = rows[0];
    return { id: r.id, projectId: r.project_id, type: r.type, content: r.content ?? undefined, createdAt: new Date(r.created_at), metadata: typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata };
  }

  // ---- Memories ----
  async createMemory(memory: Memory): Promise<void> {
    await this.ensureReady();
    await this.pool.query(`INSERT INTO memories (id, project_id, type, content, importance, confidence, status, created_at, updated_at, last_accessed_at, access_count, source_id, metadata, archived) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [memory.id, memory.projectId, memory.type, memory.content, memory.importance, memory.confidence ?? 1, memory.status ?? "active", memory.createdAt, memory.updatedAt, memory.lastAccessedAt ?? null, memory.accessCount, memory.sourceId ?? null, JSON.stringify(memory.metadata), memory.archived ? 1 : 0]);
  }
  async getMemory(id: string): Promise<Memory | null> {
    await this.ensureReady();
    const { rows } = await this.pool.query(`SELECT * FROM memories WHERE id=$1`, [id]);
    if (!rows[0]) return null;
    return this.mapMemory(rows[0]);
  }
  async updateMemory(id: string, update: Partial<Memory>): Promise<void> {
    await this.ensureReady();
    const existing = await this.getMemory(id);
    if (!existing) return;
    const merged: Memory = { ...existing, ...update, id, updatedAt: update.updatedAt ?? new Date() } as Memory;
    await this.pool.query(`UPDATE memories SET type=$1, content=$2, importance=$3, confidence=$4, status=$5, created_at=$6, updated_at=$7, last_accessed_at=$8, access_count=$9, source_id=$10, metadata=$11, archived=$12 WHERE id=$13`, [merged.type, merged.content, merged.importance, merged.confidence, merged.status ?? "active", merged.createdAt, merged.updatedAt, merged.lastAccessedAt ?? null, merged.accessCount, merged.sourceId ?? null, JSON.stringify(merged.metadata), merged.archived ? 1 : 0, id]);
  }
  async deleteMemory(id: string): Promise<void> {
    await this.ensureReady();
    // Deleting embedding automatically via cascade, but also ensure vector cleanup
    await this.pool.query(`DELETE FROM memories WHERE id=$1`, [id]);
  }
  async archiveMemory(id: string): Promise<void> {
    await this.ensureReady();
    await this.pool.query(`UPDATE memories SET archived=1, status='archived', updated_at=$1 WHERE id=$2`, [new Date(), id]);
  }
  async listMemories(projectId: string): Promise<Memory[]> {
    await this.ensureReady();
    const { rows } = await this.pool.query(`SELECT * FROM memories WHERE project_id=$1 ORDER BY updated_at DESC`, [projectId]);
    return rows.map(this.mapMemory);
  }
  async search(query: SearchQuery): Promise<SearchResult[]> {
    await this.ensureReady();
    // Enforce project isolation first
    let sql = `SELECT * FROM memories WHERE project_id=$1`;
    const params: any[] = [query.projectId];
    let idx = 2;
    if (query.types?.length) {
      sql += ` AND type IN (${query.types.map(() => `$${idx++}`).join(",")})`;
      params.push(...query.types);
    }
    if (query.minImportance !== undefined) {
      sql += ` AND importance >= $${idx++}`;
      params.push(query.minImportance);
    }
    if (!query.includeArchived) sql += ` AND archived=0 AND status != 'archived'`;
    const { rows } = await this.pool.query(sql, params);
    const memories = rows.map(this.mapMemory);
    // Keyword fallback scoring (vector search is done at MemoryEngine level with pgvector via separate query if needed)
    const qLower = query.query.toLowerCase();
    const qTokens = new Set(qLower.split(/\W+/).filter(Boolean));
    const scored = memories.map((m) => {
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

  // ---- Embeddings ----
  async upsertEmbedding(memoryId: string, vector: number[], model: string): Promise<void> {
    await this.ensureReady();
    const vecStr = `[${vector.join(",")}]`;
    await this.pool.query(`INSERT INTO embeddings (memory_id, vector, model, dimensions, vec) VALUES ($1,$2,$3,$4,$5::vector) ON CONFLICT (memory_id) DO UPDATE SET vector=EXCLUDED.vector, model=EXCLUDED.model, dimensions=EXCLUDED.dimensions, vec=EXCLUDED.vec`, [memoryId, JSON.stringify(vector), model, vector.length, vecStr]);
  }
  async getEmbedding(memoryId: string): Promise<{ vector: number[]; model: string } | null> {
    await this.ensureReady();
    const { rows } = await this.pool.query(`SELECT vector, model FROM embeddings WHERE memory_id=$1`, [memoryId]);
    if (!rows[0]) return null;
    return { vector: JSON.parse(rows[0].vector), model: rows[0].model };
  }

  /** pgvector semantic search — use when MemoryEngine wants native vector ranking */
  async vectorSearch(projectId: string, queryVector: number[], limit = 10): Promise<Array<{ memory: Memory; distance: number }>> {
    await this.ensureReady();
    const vecStr = `[${queryVector.join(",")}]`;
    const { rows } = await this.pool.query(`
      SELECT m.*, e.vec <=> $1::vector as distance
      FROM memories m
      JOIN embeddings e ON e.memory_id = m.id
      WHERE m.project_id = $2 AND m.archived=0 AND m.status != 'archived'
      ORDER BY distance ASC
      LIMIT $3
    `, [vecStr, projectId, limit]);
    return rows.map((r) => ({ memory: this.mapMemory(r), distance: Number(r.distance) }));
  }

  // ---- Retrieval logs ----
  async logRetrieval(event: RetrievalEvent): Promise<void> {
    await this.ensureReady();
    await this.pool.query(`INSERT INTO retrieval_events (id, project_id, query, retrieved_memory_ids, scores, final_context_tokens, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [event.id, event.projectId, event.query, JSON.stringify(event.retrievedMemoryIds), JSON.stringify(event.scores), event.finalContextTokens, event.createdAt]);
  }
  async listRetrievals(projectId: string, limit = 20): Promise<RetrievalEvent[]> {
    await this.ensureReady();
    const { rows } = await this.pool.query(`SELECT * FROM retrieval_events WHERE project_id=$1 ORDER BY created_at DESC LIMIT $2`, [projectId, limit]);
    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      query: r.query,
      retrievedMemoryIds: typeof r.retrieved_memory_ids === "string" ? JSON.parse(r.retrieved_memory_ids) : r.retrieved_memory_ids,
      scores: typeof r.scores === "string" ? JSON.parse(r.scores) : r.scores,
      finalContextTokens: r.final_context_tokens,
      createdAt: new Date(r.created_at),
    }));
  }

  async close(): Promise<void> { await this.pool.end(); }

  private mapProject = (row: any): Project => ({
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });
  private mapMemory = (row: any): Memory => ({
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    content: row.content,
    importance: Number(row.importance),
    confidence: Number(row.confidence),
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    lastAccessedAt: row.last_accessed_at ? new Date(row.last_accessed_at) : undefined,
    accessCount: Number(row.access_count),
    sourceId: row.source_id ?? undefined,
    metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata,
    archived: !!row.archived,
  });
}
