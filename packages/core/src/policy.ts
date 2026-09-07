import type { Memory } from "./types.js";

export interface MemoryPolicy {
  autoExtract?: boolean;
  minimumImportance?: number; // default 0.65
  maxMemoriesPerProject?: number; // default 10000
  retainConversations?: boolean; // default false
  storeSensitiveData?: boolean; // default false
  shouldRemember?: (memory: Omit<Memory, "id" | "createdAt" | "updatedAt">) => boolean | Promise<boolean>;
  maxTokensPerContext?: number; // default 6000
}

export const DEFAULT_POLICY: Required<Omit<MemoryPolicy, "shouldRemember">> & { shouldRemember?: MemoryPolicy["shouldRemember"] } = {
  autoExtract: false,
  minimumImportance: 0.65,
  maxMemoriesPerProject: 10000,
  retainConversations: false,
  storeSensitiveData: false,
  maxTokensPerContext: 6000,
};

export function resolvePolicy(overrides?: MemoryPolicy): typeof DEFAULT_POLICY {
  return { ...DEFAULT_POLICY, ...overrides };
}

export const SENSITIVE_PATTERNS = [
  /password/i,
  /api[_-]?key/i,
  /secret/i,
  /\bssn\b/i,
  /credit[_-]?card/i,
];

export function isSensitive(content: string): boolean {
  return SENSITIVE_PATTERNS.some((re) => re.test(content));
}
