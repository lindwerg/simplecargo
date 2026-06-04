import { loadEnv } from "./env-schema";

export type { Env } from "./env-schema";
export { envSchema, loadEnv } from "./env-schema";

// Eager singleton: validation runs the moment this module is first imported, so a
// missing or malformed variable crashes at boot with a readable message rather
// than surfacing as an opaque runtime error deep in a request.
export const env = loadEnv();
