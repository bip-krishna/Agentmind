import type { MemoryEngine } from "../../core/src/memory.js";
import type { ChatMessage } from "./openai.js";
export interface AnthropicWithMemoryOptions {
    memory: MemoryEngine;
    messages: ChatMessage[];
    callLLM: (messages: ChatMessage[]) => Promise<string>;
    extract?: boolean;
}
export declare function withAnthropicMemory(opts: AnthropicWithMemoryOptions): Promise<{
    response: string;
    context: string;
    memories: any[];
}>;
export declare function createAnthropicCaller(anthropic: any, model: string): (messages: ChatMessage[]) => Promise<string>;
//# sourceMappingURL=anthropic.d.ts.map