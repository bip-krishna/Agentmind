export class OpenAIEmbeddingProvider {
    model;
    dimensions;
    apiKey;
    baseURL;
    constructor(opts) {
        this.apiKey = opts.apiKey;
        this.model = opts.model ?? "text-embedding-3-small";
        this.dimensions = opts.dimensions ?? 1536;
        this.baseURL = opts.baseURL ?? "https://api.openai.com/v1";
    }
    async embed(text) {
        const res = await fetch(`${this.baseURL}/embeddings`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({ model: this.model, input: text }),
        });
        if (!res.ok)
            throw new Error(`OpenAI embed failed: ${res.status} ${await res.text()}`);
        const data = (await res.json());
        return data.data[0].embedding;
    }
    async embedBatch(texts) {
        const res = await fetch(`${this.baseURL}/embeddings`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({ model: this.model, input: texts }),
        });
        if (!res.ok)
            throw new Error(`OpenAI embedBatch failed: ${res.status} ${await res.text()}`);
        const data = (await res.json());
        return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    }
}
//# sourceMappingURL=openai.js.map