import type { MemoryStore } from "../../core/src/memory-store.js";
import type { Memory, Project, Source, SearchQuery, SearchResult, RetrievalEvent } from "../../core/src/types.js";
export interface PostgresStoreOptions {
    connectionString: string;
    maxPool?: number;
    vectorDimensions?: number;
}
export declare class PostgresMemoryStore implements MemoryStore {
    private pool;
    private dimensions;
    private ready;
    constructor(opts: string | PostgresStoreOptions);
    private migrate;
    private ensureReady;
    createProject(project: Project): Promise<Project>;
    getProject(id: string): Promise<Project | null>;
    getProjectByName(name: string): Promise<Project | null>;
    listProjects(): Promise<Project[]>;
    deleteProject(projectId: string): Promise<void>;
    createSource(source: Source): Promise<Source>;
    getSource(id: string): Promise<Source | null>;
    createMemory(memory: Memory): Promise<void>;
    getMemory(id: string): Promise<Memory | null>;
    updateMemory(id: string, update: Partial<Memory>): Promise<void>;
    deleteMemory(id: string): Promise<void>;
    archiveMemory(id: string): Promise<void>;
    listMemories(projectId: string): Promise<Memory[]>;
    search(query: SearchQuery): Promise<SearchResult[]>;
    upsertEmbedding(memoryId: string, vector: number[], model: string): Promise<void>;
    getEmbedding(memoryId: string): Promise<{
        vector: number[];
        model: string;
    } | null>;
    /** pgvector semantic search — use when MemoryEngine wants native vector ranking */
    vectorSearch(projectId: string, queryVector: number[], limit?: number): Promise<Array<{
        memory: Memory;
        distance: number;
    }>>;
    logRetrieval(event: RetrievalEvent): Promise<void>;
    listRetrievals(projectId: string, limit?: number): Promise<RetrievalEvent[]>;
    close(): Promise<void>;
    private mapProject;
    private mapMemory;
}
//# sourceMappingURL=postgres-store.d.ts.map