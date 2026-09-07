import { z } from "zod";

// ---------- Memory types ----------

export const MemoryTypeSchema = z.enum([
  "fact",
  "preference",
  "decision",
  "event",
  "knowledge",
  "procedure",
  "task",
  "summary",
]);

export type MemoryType = z.infer<typeof MemoryTypeSchema>;

export const MemoryStatusSchema = z.enum(["active", "superseded", "archived"]);
export type MemoryStatus = z.infer<typeof MemoryStatusSchema>;

export interface Memory {
  id: string;
  projectId: string;
  type: MemoryType;
  content: string;
  embedding?: number[];
  importance: number; // 0-1
  confidence: number; // 0-1
  status: MemoryStatus;
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt?: Date;
  accessCount: number;
  sourceId?: string;
  metadata: Record<string, unknown>;
  archived: boolean;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type SourceType = "conversation" | "document" | "tool" | "manual";

export interface Source {
  id: string;
  projectId: string;
  type: SourceType;
  content?: string;
  createdAt: Date;
  metadata: Record<string, unknown>;
}

export interface RetrievalEvent {
  id: string;
  projectId: string;
  query: string;
  retrievedMemoryIds: string[];
  scores: Record<string, number>;
  finalContextTokens: number;
  createdAt: Date;
}

// ---------- Search ----------

export interface SearchQuery {
  projectId: string;
  query: string;
  types?: MemoryType[];
  limit?: number;
  minImportance?: number;
  includeArchived?: boolean;
}

export interface CandidateMemory extends Memory {
  semanticScore: number;
  keywordScore: number;
  finalScore: number;
}

export interface SearchResult {
  memory: Memory;
  score: number;
  semanticScore: number;
  keywordScore: number;
}

// ---------- Context ----------

export interface ContextOptions {
  query: string;
  maxTokens?: number; // default 6000
  limit?: number;
  types?: MemoryType[];
}

export interface ContextResult {
  memories: Memory[];
  text: string;
  tokenCount: number;
  sources: string[];
}

// ---------- Validation schemas ----------

export const CreateMemoryInputSchema = z.object({
  type: MemoryTypeSchema.default("fact"),
  content: z.string().min(1).max(10000),
  importance: z.number().min(0).max(1).default(0.5),
  confidence: z.number().min(0).max(1).default(1),
  sourceId: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export type CreateMemoryInput = z.infer<typeof CreateMemoryInputSchema>;
