/**
 * Deterministic, zero-dependency local embedding for tests / offline dev.
 * Hashing trick: char n-grams -> fixed dimensions, L2-normalized.
 * NOT suitable for production quality but ensures storage contract works without API keys.
 */
export class LocalEmbeddingProvider {
    model = "local-hash-v1";
    dimensions;
    constructor(dimensions = 256) {
        this.dimensions = dimensions;
    }
    async embed(text) {
        return this.hashEmbed(text);
    }
    async embedBatch(texts) {
        return texts.map((t) => this.hashEmbed(t));
    }
    hashEmbed(text) {
        const vec = new Array(this.dimensions).fill(0);
        const normalized = text.toLowerCase();
        // char trigrams
        for (let i = 0; i < normalized.length; i++) {
            const trigram = normalized.slice(i, i + 3);
            if (!trigram)
                continue;
            let hash = 0;
            for (let j = 0; j < trigram.length; j++)
                hash = (hash * 31 + trigram.charCodeAt(j)) >>> 0;
            const idx = hash % this.dimensions;
            vec[idx] += 1;
        }
        // token-level boost
        for (const tok of normalized.split(/\W+/).filter(Boolean)) {
            let hash = 0;
            for (let j = 0; j < tok.length; j++)
                hash = (hash * 131 + tok.charCodeAt(j)) >>> 0;
            const idx = (hash * 7) % this.dimensions;
            vec[idx] += 2;
        }
        // L2 normalize
        const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
        return vec.map((v) => v / norm);
    }
}
//# sourceMappingURL=local.js.map