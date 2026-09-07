export const DEFAULT_POLICY = {
    autoExtract: false,
    minimumImportance: 0.65,
    maxMemoriesPerProject: 10000,
    retainConversations: false,
    storeSensitiveData: false,
    maxTokensPerContext: 6000,
};
export function resolvePolicy(overrides) {
    return { ...DEFAULT_POLICY, ...overrides };
}
export const SENSITIVE_PATTERNS = [
    /password/i,
    /api[_-]?key/i,
    /secret/i,
    /\bssn\b/i,
    /credit[_-]?card/i,
];
export function isSensitive(content) {
    return SENSITIVE_PATTERNS.some((re) => re.test(content));
}
//# sourceMappingURL=policy.js.map