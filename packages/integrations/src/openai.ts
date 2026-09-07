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
  // Provide a function that calls OpenAI — keeps this package dependency-free
  callLLM: (messages: ChatMessage[]) => Promise<string>;
  // Optional: extract memories from assistant response
  extract?: boolean;
}

export async function withMemory(opts: WithMemoryOptions): Promise<{ response: string; context: string; memories: any[] }> {
  const lastUser = [...opts.messages].reverse().find((m) => m.role === "user");
  const query = lastUser?.content ?? opts.messages.map((m) => m.content).join("\n").slice(-500);

  const ctx = await opts.memory.context({ query, maxTokens: 4000 });
  const augmented: ChatMessage[] = ctx.text
    ? [{ role: "system", content: ctx.text }, ...opts.messages]
    : [...opts.messages];

  const response = await opts.callLLM(augmented);

  let memories: any[] = [];
  if (opts.extract !== false) {
    // Use memory's extractor if available via ingest
    const ingested = await opts.memory.ingest({ role: "assistant", content: response });
    // If autoExtract is enabled, ingest already extracted; otherwise manually remember key facts via heuristic
    if (ingested.extracted) memories = ingested.extracted;
  }

  return { response, context: ctx.text, memories };
}

/** Helper for OpenAI SDK users */
export function createOpenAICaller(openai: any, model: string, opts?: { temperature?: number }) {
  return async (messages: ChatMessage[]) => {
    const res = await openai.chat.completions.create({ model, messages, temperature: opts?.temperature ?? 0.7 });
    return res.choices[0].message.content as string;
  };
}
