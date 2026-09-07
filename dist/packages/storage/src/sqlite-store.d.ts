import type { MemoryStore } from "../../core/src/memory-store.js";
import type { Memory, Project, Source, SearchQuery, SearchResult, RetrievalEvent } from "../../core/src/types.js";
export interface SqliteStoreOptions {
    path?: string;
}
export declare class SqliteMemoryStore implements MemoryStore {
    private db;
    constructor(opts?: SqliteStoreOptions);
    private migrate;
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
    deleteEmbedding(memoryId: string): Promise<void>;
    logRetrieval(event: RetrievalEvent): Promise<void>;
    listRetrievals(projectId: string, limit?: number): Promise<RetrievalEvent[]>;
    close(): Promise<void>;
    private mapProject;
    private mapMemory;
}
//# sourceMappingURL=sqlite-store.d.ts.map