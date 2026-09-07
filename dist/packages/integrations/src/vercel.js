/**
 * Vercel AI SDK integration
 * Example:
 *   import { withMemoryAISDK } from "@agentmind/integrations/vercel";
 *   const { text } = await withMemoryAISDK({ memory, prompt, generateText });
 */
export async function withMemoryAISDK(opts) {
    const ctx = await opts.memory.context({ query: opts.prompt, maxTokens: 4000 });
    const text = await opts.generateText(opts.prompt, ctx.text || undefined);
    await opts.memory.ingest({ role: "assistant", content: text });
    return { text, context: ctx.text };
}
// LangChain adapter stub
export async function withLangChainMemory(opts) {
    const ctx = await opts.memory.context({ query: opts.input });
    const output = await opts.callChain(opts.input, ctx.text);
    await opts.memory.ingest({ role: "assistant", content: output });
    return { output, context: ctx.text };
}
//# sourceMappingURL=vercel.js.map