import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

// Catch-all Better Auth route: handles /api/auth/sign-in, /sign-out, etc.
export const { GET, POST } = toNextJsHandler(auth);
