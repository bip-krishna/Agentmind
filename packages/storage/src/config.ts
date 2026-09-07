import { SqliteMemoryStore } from "./sqlite-store.js";
import { PostgresMemoryStore } from "./postgres-store.js";
import type { MemoryStore } from "../../core/src/memory-store.js";

export interface StorageConfig {
  provider: "sqlite" | "postgres" | "memory";
  sqlite?: { path?: string };
  postgres?: { connectionString: string };
}

export function resolveStorageConfig(): StorageConfig {
  const pgUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (pgUrl) return { provider: "postgres", postgres: { connectionString: pgUrl } };
  const sqlitePath = process.env.CTX_MEMORY_DB ?? "./.context-memory/memory.db";
  if (sqlitePath === ":memory:") return { provider: "memory" };
  return { provider: "sqlite", sqlite: { path: sqlitePath } };
}

export function createStoreFromConfig(config: StorageConfig): MemoryStore {
  switch (config.provider) {
    case "postgres":
      return new PostgresMemoryStore(config.postgres!.connectionString);
    case "sqlite":
      return new SqliteMemoryStore({ path: config.sqlite?.path });
    case "memory":
      // lazy import to avoid circular
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return new SqliteMemoryStore({ path: ":memory:" });
    default:
      return new SqliteMemoryStore({ path: "./.context-memory/memory.db" });
  }
}

export function autoDetectProject(): string {
  // Priority: env -> package.json name -> git folder -> cwd basename
  if (process.env.CTX_MEMORY_PROJECT) return process.env.CTX_MEMORY_PROJECT;
  try {
    const pkg = JSON.parse(require("node:fs").readFileSync("package.json", "utf-8"));
    if (pkg.name) return String(pkg.name).replace(/^@.*\//, "");
  } catch {}
  try {
    const cwd = process.cwd().split("/").pop() ?? "default";
    return cwd;
  } catch {
    return "default";
  }
}
