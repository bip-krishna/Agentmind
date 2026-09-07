/**
 * Migration system for both SQLite (node:sqlite) and Postgres.
 * Versioned, idempotent — tracks `schema_migrations` table.
 */
export const MIGRATIONS = [
    {
        version: 1,
        name: "initial",
        up: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
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
      CREATE TABLE IF NOT EXISTS consolidations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        summary_memory_id TEXT REFERENCES memories(id) ON DELETE SET NULL,
        source_memory_ids TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_id);
      CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
      CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status);
    `,
    },
    {
        version: 2,
        name: "pgvector",
        up: `
      -- Postgres only: enable pgvector
      -- CREATE EXTENSION IF NOT EXISTS vector;
      -- ALTER TABLE embeddings ADD COLUMN IF NOT EXISTS vec vector(1536);
      -- CREATE INDEX IF NOT EXISTS idx_embeddings_vec ON embeddings USING hnsw (vec vector_cosine_ops);
      -- For SQLite, this migration is a no-op (vector stored as JSON text)
      SELECT 1;
    `,
    },
];
export function getPendingMigrations(applied) {
    return MIGRATIONS.filter((m) => !applied.includes(m.version));
}
//# sourceMappingURL=migrations.js.map