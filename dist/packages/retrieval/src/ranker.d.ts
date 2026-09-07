import type { Memory } from "../../core/src/types.js";
export interface RankerWeights {
    semantic: number;
    keyword: number;
    importance: number;
    recency: number;
}
export interface RankedItem {
    memory: Memory;
    score: number;
    semanticScore: number;
    keywordScore: number;
}
export declare class HybridRanker {
    weights: RankerWeights;
    constructor(weights?: Partial<RankerWeights>);
    rank(memories: Array<Memory & {
        _vec?: number[];
    }>, query: string, queryVec?: number[]): RankedItem[];
}
//# sourceMappingURL=ranker.d.ts.map