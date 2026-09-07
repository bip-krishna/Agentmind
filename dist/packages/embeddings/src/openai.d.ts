import type { EmbeddingProvider } from "./provider.js";
export interface OpenAIEmbeddingOptions {
    apiKey: string;
    model?: string;
    dimensions?: number;
    baseURL?: string;
}
export declare class OpenAIEmbeddingProvider implements EmbeddingProvider {
    readonly model: string;
    readonly dimensions: number;
    private apiKey;
    private baseURL;
    constructor(opts: OpenAIEmbeddingOptions);
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
}
//# sourceMappingURL=openai.d.ts.map