import type { EmbeddingProvider } from "./provider.js";
/**
 * Deterministic, zero-dependency local embedding for tests / offline dev.
 * Hashing trick: char n-grams -> fixed dimensions, L2-normalized.
 * NOT suitable for production quality but ensures storage contract works without API keys.
 */
export declare class LocalEmbeddingProvider implements EmbeddingProvider {
    readonly model = "local-hash-v1";
    readonly dimensions: number;
    constructor(dimensions?: number);
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
    private hashEmbed;
}
//# sourceMappingURL=local.d.ts.map