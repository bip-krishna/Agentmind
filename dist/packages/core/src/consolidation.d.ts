import type { MemoryStore } from "./memory-store.js";
import type { Memory } from "./types.js";
import type { EmbeddingProvider } from "../../embeddings/src/provider.js";
/**
 * Memory consolidation: 1000 memories -> 150 useful memories.
 * Keeps originals as archived, creates summary memories.
 * Uses embedding similarity to cluster, then heuristic summary.
 */
export interface ConsolidationResult {
    summary: Memory;
    sourceIds: string[];
}
export declare class Consolidator {
    private store;
    private embed?;
    constructor(store: MemoryStore, embed?: EmbeddingProvider | undefined);
    /**
     * Consolidate a project. Groups memories with cosine > threshold (0.82) and creates summaries.
     * Returns summaries created.
     */
    consolidate(projectId: string, opts?: {
        threshold?: number;
        minClusterSize?: number;
    }): Promise<ConsolidationResult[]>;
    private summarizeCluster;
}
//# sourceMappingURL=consolidation.d.ts.map