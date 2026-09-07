import { EventEmitter } from "node:events";
import type { Memory, RetrievalEvent } from "./types.js";
export type MemoryEventMap = {
    "memory.created": (memory: Memory) => void;
    "memory.updated": (memory: Memory) => void;
    "memory.deleted": (id: string) => void;
    "memory.retrieved": (memories: Memory[], query: string) => void;
    "memory.archived": (memory: Memory) => void;
    "memory.superseded": (old: Memory, next: Memory) => void;
    "retrieval.completed": (event: RetrievalEvent) => void;
    "consolidation.completed": (summary: Memory, sources: string[]) => void;
};
export declare class MemoryEvents extends EventEmitter {
    emit<K extends keyof MemoryEventMap>(event: K, ...args: Parameters<MemoryEventMap[K]>): boolean;
    on<K extends keyof MemoryEventMap>(event: K, listener: MemoryEventMap[K]): this;
    off<K extends keyof MemoryEventMap>(event: K, listener: MemoryEventMap[K]): this;
}
//# sourceMappingURL=events.d.ts.map