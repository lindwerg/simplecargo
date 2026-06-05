import { auth } from "@/lib/auth";

export type UserRole = "admin" | "operator" | "viewer";

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
}

export class AuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

// Authoritative session check for API route handlers (middleware only does the
// optimistic cookie guard, and excludes /api entirely). Writers = admin|operator;
// viewers are read-only. Throws AuthError → caller maps to apiFail(status).
export async function requireWriter(headers: Headers): Promise<SessionUser> {
  const session = await auth.api.getSession({ headers });
  if (!session) {
    throw new AuthError(401, "Требуется вход");
  }
  const role = (session.user.role ?? "operator") as UserRole;
  if (role === "viewer") {
    throw new AuthError(403, "Недостаточно прав");
  }
  return { id: session.user.id, email: session.user.email, role };
}

// Read-only gate — any signed-in role (incl. viewer) may read. Throws 401 only.
export async function requireSession(headers: Headers): Promise<SessionUser> {
  const session = await auth.api.getSession({ headers });
  if (!session) {
    throw new AuthError(401, "Требуется вход");
  }
  const role = (session.user.role ?? "operator") as UserRole;
  return { id: session.user.id, email: session.user.email, role };
}
