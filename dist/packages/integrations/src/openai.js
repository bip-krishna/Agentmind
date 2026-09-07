export async function withMemory(opts) {
    const lastUser = [...opts.messages].reverse().find((m) => m.role === "user");
    const query = lastUser?.content ?? opts.messages.map((m) => m.content).join("\n").slice(-500);
    const ctx = await opts.memory.context({ query, maxTokens: 4000 });
    const augmented = ctx.text
        ? [{ role: "system", content: ctx.text }, ...opts.messages]
        : [...opts.messages];
    const response = await opts.callLLM(augmented);
    let memories = [];
    if (opts.extract !== false) {
        // Use memory's extractor if available via ingest
        const ingested = await opts.memory.ingest({ role: "assistant", content: response });
        // If autoExtract is enabled, ingest already extracted; otherwise manually remember key facts via heuristic
        if (ingested.extracted)
            memories = ingested.extracted;
    }
    return { response, context: ctx.text, memories };
}
/** Helper for OpenAI SDK users */
export function createOpenAICaller(openai, model, opts) {
    return async (messages) => {
        const res = await openai.chat.completions.create({ model, messages, temperature: opts?.temperature ?? 0.7 });
        return res.choices[0].message.content;
    };
}
//# sourceMappingURL=openai.js.map