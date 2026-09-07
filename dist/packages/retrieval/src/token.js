/** Very rough token estimator: ~4 chars per token */
export function estimateTokens(text) {
    if (!text)
        return 0;
    return Math.ceil(text.length / 4);
}
//# sourceMappingURL=token.js.map