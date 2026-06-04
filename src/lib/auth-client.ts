import { createAuthClient } from "better-auth/react";

// Browser auth client (consumed by the login page in P0-8). Same-origin: the
// catch-all handler lives at /api/auth on this app, so no baseURL is needed.
export const authClient = createAuthClient();

export const { signIn, signOut, useSession } = authClient;
