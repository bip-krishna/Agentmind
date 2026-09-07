import type { Memory } from "./types.js";
export interface MemoryPolicy {
    autoExtract?: boolean;
    minimumImportance?: number;
    maxMemoriesPerProject?: number;
    retainConversations?: boolean;
    storeSensitiveData?: boolean;
    shouldRemember?: (memory: Omit<Memory, "id" | "createdAt" | "updatedAt">) => boolean | Promise<boolean>;
    maxTokensPerContext?: number;
}
export declare const DEFAULT_POLICY: Required<Omit<MemoryPolicy, "shouldRemember">> & {
    shouldRemember?: MemoryPolicy["shouldRemember"];
};
export declare function resolvePolicy(overrides?: MemoryPolicy): typeof DEFAULT_POLICY;
export declare const SENSITIVE_PATTERNS: RegExp[];
export declare function isSensitive(content: string): boolean;
//# sourceMappingURL=policy.d.ts.map