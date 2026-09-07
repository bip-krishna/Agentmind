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
export const MemoryStatusSchema = z.enum(["active", "superseded", "archived"]);
// ---------- Validation schemas ----------
export const CreateMemoryInputSchema = z.object({
    type: MemoryTypeSchema.default("fact"),
    content: z.string().min(1).max(10000),
    importance: z.number().min(0).max(1).default(0.5),
    confidence: z.number().min(0).max(1).default(1),
    sourceId: z.string().optional(),
    metadata: z.record(z.unknown()).default({}),
});
//# sourceMappingURL=types.js.map