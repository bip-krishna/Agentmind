import { IncomingMessage, ServerResponse } from "node:http";
import { SqliteMemoryStore } from "../../../packages/storage/src/sqlite-store.js";
declare const store: SqliteMemoryStore;
declare const server: import("http").Server<typeof IncomingMessage, typeof ServerResponse>;
export { server, store };
//# sourceMappingURL=server.d.ts.map