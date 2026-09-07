import { randomUUID } from "node:crypto";
import type { MemoryStore } from "./memory-store.js";
import type { Memory } from "./types.js";
import type { EmbeddingProvider } from "../../embeddings/src/provider.js";
import { cosineSimilarity } from "../../embeddings/src/provider.js";

/**
 * Memory consolidation: 1000 memories -> 150 useful memories.
 * Keeps originals as archived, creates summary memories.
 * Uses embedding similarity to cluster, then heuristic summary.
 */

export interface ConsolidationResult {
  summary: Memory;
  sourceIds: string[];
}

export class Consolidator {
  constructor(private store: MemoryStore, private embed?: EmbeddingProvider) {}

  /**
   * Consolidate a project. Groups memories with cosine > threshold (0.82) and creates summaries.
   * Returns summaries created.
   */
  async consolidate(projectId: string, opts?: { threshold?: number; minClusterSize?: number }): Promise<ConsolidationResult[]> {
    const threshold = opts?.threshold ?? 0.82;
    const minClusterSize = opts?.minClusterSize ?? 3;
    const memories = (await this.store.listMemories(projectId)).filter((m) => !m.archived && m.status === "active");
    if (memories.length < minClusterSize) return [];

    // Build embedding map
    const vectors = new Map<string, number[]>();
    for (const m of memories) {
      const emb = await this.store.getEmbedding(m.id);
      if (emb) vectors.set(m.id, emb.vector);
      else if (this.embed) {
        const v = await this.embed.embed(m.content);
        vectors.set(m.id, v);
      }
    }

    // Greedy clustering
    const clusters: string[][] = [];
    const visited = new Set<string>();
    for (const m of memories) {
      if (visited.has(m.id)) continue;
      const cluster = [m.id];
      visited.add(m.id);
      const vecA = vectors.get(m.id);
      if (!vecA) continue;
      for (const other of memories) {
        if (visited.has(other.id)) continue;
        const vecB = vectors.get(other.id);
        if (!vecB) continue;
        if (cosineSimilarity(vecA, vecB) > threshold) {
          cluster.push(other.id);
          visited.add(other.id);
        }
      }
      if (cluster.length >= minClusterSize) clusters.push(cluster);
    }

    const results: ConsolidationResult[] = [];
    for (const cluster of clusters) {
      const sourceMems = cluster.map((id) => memories.find((m) => m.id === id)!).filter(Boolean);
      const summaryContent = this.summarizeCluster(sourceMems);
      const now = new Date();
      const summary: Memory = {
        id: randomUUID(),
        projectId,
        type: "summary",
        content: summaryContent,
        importance: Math.max(...sourceMems.map((m) => m.importance)),
        confidence: 0.85,
        status: "active",
        createdAt: now,
        updatedAt: now,
        accessCount: 0,
        metadata: { consolidatedFrom: cluster, count: cluster.length },
        archived: false,
      };
      await this.store.createMemory(summary);
      if (this.embed) {
        const vec = await this.embed.embed(summaryContent);
        await this.store.upsertEmbedding(summary.id, vec, this.embed.model);
      }
      // Archive sources but keep traceable
      for (const id of cluster) {
        await this.store.updateMemory(id, { archived: true, status: "archived", updatedAt: now });
      }
      results.push({ summary, sourceIds: cluster });
    }
    return results;
  }

  private summarizeCluster(mems: Memory[]): string {
    // Simple heuristic: most important + common prefix extraction
    const byImp = [...mems].sort((a, b) => b.importance - a.importance);
    const top = byImp[0].content;
    const count = mems.length;
    const types = [...new Set(mems.map((m) => m.type))].join(", ");
    return `Consolidated ${count} memories (${types}): ${top} (and ${count - 1} related memories about similar topic)`;
  }
}
