import type { MemoryEngine } from "../../core/src/memory.js";
/**
 * Vercel AI SDK integration
 * Example:
 *   import { withMemoryAISDK } from "@agentmind/integrations/vercel";
 *   const { text } = await withMemoryAISDK({ memory, prompt, generateText });
 */
export declare function withMemoryAISDK(opts: {
    memory: MemoryEngine;
    prompt: string;
    generateText: (prompt: string, system?: string) => Promise<string>;
}): Promise<{
    text: string;
    context: string;
}>;
export declare function withLangChainMemory(opts: {
    memory: MemoryEngine;
    input: string;
    callChain: (input: string, context: string) => Promise<string>;
}): Promise<{
    output: string;
    context: string;
}>;
//# sourceMappingURL=vercel.d.ts.map