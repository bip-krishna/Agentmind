import { cosineSimilarity } from "../../embeddings/src/provider.js";
import type { Memory } from "../../core/src/types.js";

export interface RankerWeights {
  semantic: number; // 0.6
  keyword: number; // 0.2
  importance: number; // 0.1
  recency: number; // 0.1
}

export interface RankedItem {
  memory: Memory;
  score: number;
  semanticScore: number;
  keywordScore: number;
}

function keywordScore(query: string, content: string): number {
  const qTokens = new Set(query.toLowerCase().split(/\W+/).filter(Boolean));
  const cTokens = content.toLowerCase().split(/\W+/).filter(Boolean);
  if (qTokens.size === 0) return 0;
  let hits = 0;
  for (const t of cTokens) if (qTokens.has(t)) hits++;
  // exact phrase boost
  const phrase = query.toLowerCase().trim();
  const phraseBoost = content.toLowerCase().includes(phrase) ? 0.3 : 0;
  return Math.min(1, hits / qTokens.size + phraseBoost);
}

function recencyScore(mem: Memory): number {
  const ageMs = Date.now() - new Date(mem.updatedAt).getTime();
  const days = ageMs / (1000 * 60 * 60 * 24);
  // exponential decay, half-life ~30 days
  return Math.exp(-days / 30);
}

export class HybridRanker {
  weights: RankerWeights;

  constructor(weights?: Partial<RankerWeights>) {
    this.weights = {
      semantic: weights?.semantic ?? 0.6,
      keyword: weights?.keyword ?? 0.2,
      importance: weights?.importance ?? 0.1,
      recency: weights?.recency ?? 0.1,
    };
  }

  rank(
    memories: Array<Memory & { _vec?: number[] }>,
    query: string,
    queryVec?: number[]
  ): RankedItem[] {
    const scored = memories.map((m) => {
      const semantic = queryVec && m._vec ? (cosineSimilarity(queryVec, m._vec) + 1) / 2 : 0; // normalize -1..1 -> 0..1
      const kw = keywordScore(query, m.content);
      const imp = m.importance;
      const rec = recencyScore(m);
      const finalScore =
        semantic * this.weights.semantic +
        kw * this.weights.keyword +
        imp * this.weights.importance +
        rec * this.weights.recency;

      return {
        memory: m,
        score: finalScore,
        semanticScore: semantic,
        keywordScore: kw,
      } as RankedItem;
    });

    // If no query vectors, keyword+importance+recency still ranks
    scored.sort((a, b) => b.score - a.score);
    return scored;
  }
}
