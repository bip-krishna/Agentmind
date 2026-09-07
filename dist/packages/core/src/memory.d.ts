import { type CreateMemoryInput, type ContextOptions, type ContextResult, type Memory as MemoryRecord, type MemoryType, type SearchResult } from "./types.js";
import type { MemoryStore } from "./memory-store.js";
import type { EmbeddingProvider } from "../../embeddings/src/provider.js";
import { MemoryEvents } from "./events.js";
import { type MemoryPolicy } from "./policy.js";
import type { ExtractorProvider } from "./extraction.js";
export interface MemoryCreateOptions {
    project: string;
    store?: MemoryStore;
    embeddingProvider?: EmbeddingProvider;
    extractor?: ExtractorProvider;
    policy?: MemoryPolicy;
}
export type MemoryLifecycle = "extracted" | "candidate" | "validated" | "stored" | "retrieved" | "updated" | "archived";
export declare class MemoryEngine {
    private store;
    private projectId;
    private projectName;
    private embeddingProvider?;
    private extractor?;
    private policy;
    readonly events: MemoryEvents;
    private ranker;
    private consolidator;
    private constructor();
    static create(opts: MemoryCreateOptions): Promise<MemoryEngine>;
    get project(): {
        id: string;
        name: string;
    };
    on<K extends Parameters<MemoryEvents["on"]>[0]>(event: K, listener: Parameters<MemoryEvents["on"]>[1]): this;
    remember(input: Partial<CreateMemoryInput> & {
        content: string;
        type?: MemoryType;
    }): Promise<MemoryRecord>;
    /** ingest raw conversation — stores source + auto-extracts if policy/extractor configured */
    ingest(input: {
        role: string;
        content: string;
        sourceType?: "conversation" | "document" | "tool" | "manual";
    }): Promise<{
        sourceId: string;
        extracted?: MemoryRecord[];
    }>;
    search(query: string, opts?: {
        limit?: number;
        types?: MemoryType[];
        minImportance?: number;
    }): Promise<SearchResult[]>;
    context(opts: ContextOptions): Promise<ContextResult>;
    context(query: string): Promise<ContextResult>;
    buildContext(opts: ContextOptions): Promise<ContextResult>;
    forget(id: string): Promise<void>;
    forgetProject(projectId?: string): Promise<void>;
    archive(id: string): Promise<void>;
    deleteProject(): Promise<void>;
    export(filter?: {
        includeArchived?: boolean;
    }): Promise<{
        project: {
            id: string;
            name: string;
        };
        memories: MemoryRecord[];
    }>;
    consolidate(opts?: {
        threshold?: number;
        minClusterSize?: number;
    }): Promise<import("./consolidation.js").ConsolidationResult[]>;
    updateMemory(id: string, update: Partial<MemoryRecord>): Promise<void>;
    private isNearDuplicate;
    private maybeSupersedeConflicting;
}
export declare const Memory: typeof MemoryEngine;
//# sourceMappingURL=memory.d.ts.map