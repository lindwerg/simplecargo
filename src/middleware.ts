import { type NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Route segments behind auth. The check here is OPTIMISTIC only (cookie presence);
// the authoritative getSession() runs in the Server Component (P0-8). D5.
const PROTECTED_PREFIXES = ["/dashboard", "/requests", "/directions", "/reports"];

// Per-request Content-Security-Policy. script-src is nonce-based with NO
// unsafe-inline/unsafe-eval (ARCHITECTURE §6). style-src keeps 'unsafe-inline'
// because Next/React stream inline <style> (and Tailwind lands in P0-6) and
// style nonces are not reliably honored by browsers (ECC web/security.md).
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function middleware(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  // Optimistic guard — cookie presence only, never getSession()/DB (D5).
  // getSessionCookie reads the signed session cookie (handles the prod secure
  // prefix automatically); null means no session → bounce to login.
  if (isProtected(request.nextUrl.pathname) && !getSessionCookie(request)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    const redirect = NextResponse.redirect(loginUrl); // 307
    redirect.headers.set("Content-Security-Policy", csp);
    return redirect;
  }

  // Forward the nonce + CSP on the REQUEST headers so Next applies the nonce to
  // its own framework <script> tags; also set CSP on the response.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Broad matcher → CSP on every HTML response (MVP_PLAN §0.4). Excludes API
  // routes and static assets; the auth redirect is gated to PROTECTED_PREFIXES.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
