import { z } from "zod";
export declare const MemoryTypeSchema: z.ZodEnum<["fact", "preference", "decision", "event", "knowledge", "procedure", "task", "summary"]>;
export type MemoryType = z.infer<typeof MemoryTypeSchema>;
export declare const MemoryStatusSchema: z.ZodEnum<["active", "superseded", "archived"]>;
export type MemoryStatus = z.infer<typeof MemoryStatusSchema>;
export interface Memory {
    id: string;
    projectId: string;
    type: MemoryType;
    content: string;
    embedding?: number[];
    importance: number;
    confidence: number;
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
export interface ContextOptions {
    query: string;
    maxTokens?: number;
    limit?: number;
    types?: MemoryType[];
}
export interface ContextResult {
    memories: Memory[];
    text: string;
    tokenCount: number;
    sources: string[];
}
export declare const CreateMemoryInputSchema: z.ZodObject<{
    type: z.ZodDefault<z.ZodEnum<["fact", "preference", "decision", "event", "knowledge", "procedure", "task", "summary"]>>;
    content: z.ZodString;
    importance: z.ZodDefault<z.ZodNumber>;
    confidence: z.ZodDefault<z.ZodNumber>;
    sourceId: z.ZodOptional<z.ZodString>;
    metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    type: "fact" | "preference" | "decision" | "event" | "knowledge" | "procedure" | "task" | "summary";
    content: string;
    importance: number;
    confidence: number;
    metadata: Record<string, unknown>;
    sourceId?: string | undefined;
}, {
    content: string;
    type?: "fact" | "preference" | "decision" | "event" | "knowledge" | "procedure" | "task" | "summary" | undefined;
    importance?: number | undefined;
    confidence?: number | undefined;
    sourceId?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}>;
export type CreateMemoryInput = z.infer<typeof CreateMemoryInputSchema>;
//# sourceMappingURL=types.d.ts.map