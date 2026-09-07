import type { EmbeddingProvider } from "./provider.js";

export interface OpenAIEmbeddingOptions {
  apiKey: string;
  model?: string; // default text-embedding-3-small
  dimensions?: number;
  baseURL?: string;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  private apiKey: string;
  private baseURL: string;

  constructor(opts: OpenAIEmbeddingOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? "text-embedding-3-small";
    this.dimensions = opts.dimensions ?? 1536;
    this.baseURL = opts.baseURL ?? "https://api.openai.com/v1";
  }

  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseURL}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: text }),
    });
    if (!res.ok) throw new Error(`OpenAI embed failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as any;
    return data.data[0].embedding as number[];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.baseURL}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!res.ok) throw new Error(`OpenAI embedBatch failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as any;
    return data.data.sort((a: any, b: any) => a.index - b.index).map((d: any) => d.embedding);
  }
}
