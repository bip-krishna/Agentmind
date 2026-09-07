import type {
  Memory,
  Project,
  Source,
  SearchQuery,
  SearchResult,
  RetrievalEvent,
} from "./types.js";

/**
 * Core abstraction — Memory Store.
 * LocalStore (SQLite) and PostgresStore both implement this.
 * Dashboard / CLI / core engine depend only on this interface.
 */
export interface MemoryStore {
  // Projects
  createProject(project: Project): Promise<Project>;
  getProject(id: string): Promise<Project | null>;
  getProjectByName(name: string): Promise<Project | null>;
  listProjects(): Promise<Project[]>;
  deleteProject(projectId: string): Promise<void>;

  // Sources
  createSource(source: Source): Promise<Source>;
  getSource(id: string): Promise<Source | null>;

  // Memories
  createMemory(memory: Memory): Promise<void>;
  getMemory(id: string): Promise<Memory | null>;
  updateMemory(id: string, update: Partial<Memory>): Promise<void>;
  deleteMemory(id: string): Promise<void>;
  archiveMemory(id: string): Promise<void>;
  listMemories(projectId: string): Promise<Memory[]>;
  search(query: SearchQuery): Promise<SearchResult[]>; // keyword fallback default

  // Embeddings — stored alongside but decoupled
  upsertEmbedding(memoryId: string, vector: number[], model: string): Promise<void>;
  getEmbedding(memoryId: string): Promise<{ vector: number[]; model: string } | null>;
  deleteEmbedding?(memoryId: string): Promise<void>;

  // Optional native vector search (pgvector)
  vectorSearch?(projectId: string, queryVector: number[], limit: number): Promise<Array<{ memory: Memory; distance: number }>>;

  // Retrieval logs
  logRetrieval(event: RetrievalEvent): Promise<void>;
  listRetrievals(projectId: string, limit?: number): Promise<RetrievalEvent[]>;

  // Admin
  close?(): Promise<void>;
}
