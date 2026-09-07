/** Prompt template for LLM extraction */
export const EXTRACTION_PROMPT = `Extract only information that is likely to remain useful in future interactions.

Do not store:
- greetings
- temporary conversation
- obvious information
- filler
- transient thoughts
- sensitive information unless explicitly configured

Return JSON array of {type, content, importance, confidence} where type is one of: fact, preference, decision, event, knowledge, procedure, task, summary.
Importance 0-1, confidence 0-1. Content must be a concise standalone statement.

Conversation:
{{conversation}}
`;
/**
 * Deterministic regex-based extractor for offline / tests.
 * Real provider would call OpenAI / Anthropic with structured output.
 */
export class HeuristicExtractor {
    async extract(conversation) {
        const results = [];
        const sentences = conversation.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
        const keywords = ["decided", "will use", "using", "prefer", "need", "should", "must", "database", "postgres", "mongodb", "api", "always", "never"];
        for (const s of sentences) {
            const lower = s.toLowerCase();
            if (keywords.some((k) => lower.includes(k)) && s.length > 20 && s.length < 300) {
                const type = lower.includes("decided") || lower.includes("will use") ? "decision" : lower.includes("prefer") ? "preference" : "fact";
                results.push({
                    type,
                    content: s + ".",
                    importance: lower.includes("decided") ? 0.9 : 0.6,
                    confidence: 0.8,
                });
            }
        }
        return results;
    }
}
/**
 * LLM-backed extractor (generic). Provide a chat completion function.
 */
export class LLMExtractor {
    callLLM;
    minImportance;
    constructor(callLLM, minImportance = 0.65) {
        this.callLLM = callLLM;
        this.minImportance = minImportance;
    }
    async extract(conversation, opts) {
        const prompt = EXTRACTION_PROMPT.replace("{{conversation}}", conversation);
        const raw = await this.callLLM(prompt);
        try {
            const parsed = JSON.parse(raw);
            const threshold = opts?.minimumImportance ?? this.minImportance;
            return parsed.filter((m) => m.importance >= threshold);
        }
        catch {
            return [];
        }
    }
}
//# sourceMappingURL=extraction.js.map