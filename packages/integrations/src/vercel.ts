import type { MemoryEngine } from "../../core/src/memory.js";

/**
 * Vercel AI SDK integration
 * Example:
 *   import { withMemoryAISDK } from "@agentmind/integrations/vercel";
 *   const { text } = await withMemoryAISDK({ memory, prompt, generateText });
 */
export async function withMemoryAISDK(opts: {
  memory: MemoryEngine;
  prompt: string;
  generateText: (prompt: string, system?: string) => Promise<string>;
}): Promise<{ text: string; context: string }> {
  const ctx = await opts.memory.context({ query: opts.prompt, maxTokens: 4000 });
  const text = await opts.generateText(opts.prompt, ctx.text || undefined);
  await opts.memory.ingest({ role: "assistant", content: text });
  return { text, context: ctx.text };
}

// LangChain adapter stub
export async function withLangChainMemory(opts: { memory: MemoryEngine; input: string; callChain: (input: string, context: string) => Promise<string> }) {
  const ctx = await opts.memory.context({ query: opts.input });
  const output = await opts.callChain(opts.input, ctx.text);
  await opts.memory.ingest({ role: "assistant", content: output });
  return { output, context: ctx.text };
}
