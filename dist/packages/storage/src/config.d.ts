import type { MemoryStore } from "../../core/src/memory-store.js";
export interface StorageConfig {
    provider: "sqlite" | "postgres" | "memory";
    sqlite?: {
        path?: string;
    };
    postgres?: {
        connectionString: string;
    };
}
export declare function resolveStorageConfig(): StorageConfig;
export declare function createStoreFromConfig(config: StorageConfig): MemoryStore;
export declare function autoDetectProject(): string;
//# sourceMappingURL=config.d.ts.map