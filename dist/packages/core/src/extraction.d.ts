import type { MemoryType } from "./types.js";
export interface ExtractedMemory {
    type: MemoryType;
    content: string;
    importance: number;
    confidence: number;
}
export interface ExtractorOptions {
    minimumImportance?: number;
}
export interface ExtractorProvider {
    extract(conversation: string, opts?: ExtractorOptions): Promise<ExtractedMemory[]>;
}
/** Prompt template for LLM extraction */
export declare const EXTRACTION_PROMPT = "Extract only information that is likely to remain useful in future interactions.\n\nDo not store:\n- greetings\n- temporary conversation\n- obvious information\n- filler\n- transient thoughts\n- sensitive information unless explicitly configured\n\nReturn JSON array of {type, content, importance, confidence} where type is one of: fact, preference, decision, event, knowledge, procedure, task, summary.\nImportance 0-1, confidence 0-1. Content must be a concise standalone statement.\n\nConversation:\n{{conversation}}\n";
/**
 * Deterministic regex-based extractor for offline / tests.
 * Real provider would call OpenAI / Anthropic with structured output.
 */
export declare class HeuristicExtractor implements ExtractorProvider {
    extract(conversation: string): Promise<ExtractedMemory[]>;
}
/**
 * LLM-backed extractor (generic). Provide a chat completion function.
 */
export declare class LLMExtractor implements ExtractorProvider {
    private callLLM;
    private minImportance;
    constructor(callLLM: (prompt: string) => Promise<string>, minImportance?: number);
    extract(conversation: string, opts?: ExtractorOptions): Promise<ExtractedMemory[]>;
}
//# sourceMappingURL=extraction.d.ts.map