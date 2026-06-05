// Consistent JSON envelope for API route handlers (common/patterns.md). The first
// write-feature (P15-2) establishes this; later endpoints reuse it. The `error`
// field carries a user-safe message only — never a raw Error/stack (§4.10).

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export function apiOk<T>(data: T, status: number = 200): Response {
  return Response.json({ success: true, data } satisfies ApiEnvelope<T>, { status });
}

export function apiFail(message: string, status: number): Response {
  return Response.json({ success: false, error: message } satisfies ApiEnvelope<never>, { status });
}
