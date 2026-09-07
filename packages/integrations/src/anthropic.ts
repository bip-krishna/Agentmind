import type { MemoryEngine } from "../../core/src/memory.js";
import type { ChatMessage } from "./openai.js";

export interface AnthropicWithMemoryOptions {
  memory: MemoryEngine;
  messages: ChatMessage[];
  callLLM: (messages: ChatMessage[]) => Promise<string>;
  extract?: boolean;
}

export async function withAnthropicMemory(opts: AnthropicWithMemoryOptions) {
  const lastUser = [...opts.messages].reverse().find((m) => m.role === "user");
  const query = lastUser?.content ?? opts.messages.map((m) => m.content).join("\n").slice(-500);
  const ctx = await opts.memory.context({ query, maxTokens: 4000 });
  const system = ctx.text ? ctx.text : undefined;
  // Anthropic separates system; we prepend as system if provided
  const augmented = system ? [{ role: "system" as const, content: system }, ...opts.messages.filter((m) => m.role !== "system")] : opts.messages;
  const response = await opts.callLLM(augmented);
  let memories: any[] = [];
  if (opts.extract !== false) {
    const ingested = await opts.memory.ingest({ role: "assistant", content: response });
    if (ingested.extracted) memories = ingested.extracted;
  }
  return { response, context: ctx.text, memories };
}

export function createAnthropicCaller(anthropic: any, model: string) {
  return async (messages: ChatMessage[]) => {
    const system = messages.find((m) => m.role === "system")?.content;
    const rest = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));
    const res = await anthropic.messages.create({ model, max_tokens: 1024, system, messages: rest });
    return res.content[0].text as string;
  };
}
