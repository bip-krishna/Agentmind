/**
 * Migration system for both SQLite (node:sqlite) and Postgres.
 * Versioned, idempotent — tracks `schema_migrations` table.
 */
export interface Migration {
    version: number;
    name: string;
    up: string;
}
export declare const MIGRATIONS: Migration[];
export declare function getPendingMigrations(applied: number[]): Migration[];
//# sourceMappingURL=migrations.d.ts.map