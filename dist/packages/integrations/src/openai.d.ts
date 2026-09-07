import type { MemoryEngine } from "../../core/src/memory.js";
/**
 * OpenAI integration — automates retrieve -> context -> LLM -> extract -> store
 * Usage:
 *   import { withMemory } from "@context-memory/integrations/openai";
 *   const res = await withMemory({ memory, messages, openai, model: "gpt-4o" });
 */
export interface ChatMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
}
export interface WithMemoryOptions {
    memory: MemoryEngine;
    messages: ChatMessage[];
    callLLM: (messages: ChatMessage[]) => Promise<string>;
    extract?: boolean;
}
export declare function withMemory(opts: WithMemoryOptions): Promise<{
    response: string;
    context: string;
    memories: any[];
}>;
/** Helper for OpenAI SDK users */
export declare function createOpenAICaller(openai: any, model: string, opts?: {
    temperature?: number;
}): (messages: ChatMessage[]) => Promise<string>;
//# sourceMappingURL=openai.d.ts.map