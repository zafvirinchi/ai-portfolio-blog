// Supabase Auth is already this app's JWT issuer, verifier, and
// refresh-rotation system (access_token + refresh_token, auto-rotated
// by @supabase/ssr) — this file does not implement a parallel JWT
// system. It only decodes (never verifies; verification is Supabase
// API's job whenever the token is actually used) the current session's
// own JWT for display purposes (security dashboard, session-expiry
// checks), using a plain base64url decode of the payload segment — no
// jsonwebtoken/jose dependency needed for that.

export interface DecodedJwtClaims {
  sub?: string;
  email?: string;
  role?: string;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

function base64UrlDecode(segment: string): string {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/").padEnd(segment.length + ((4 - (segment.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

export function decodeClaims(accessToken: string): DecodedJwtClaims | null {
  const parts = accessToken.split(".");
  if (parts.length !== 3) return null;

  try {
    return JSON.parse(base64UrlDecode(parts[1])) as DecodedJwtClaims;
  } catch {
    return null;
  }
}

export function getSessionExpiry(accessToken: string): Date | null {
  const claims = decodeClaims(accessToken);
  if (!claims?.exp) return null;
  return new Date(claims.exp * 1000);
}

export function isExpired(accessToken: string): boolean {
  const expiry = getSessionExpiry(accessToken);
  return expiry ? expiry.getTime() < Date.now() : true;
}
