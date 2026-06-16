import type { Env } from "./env";

export type SessionMode = "live" | "test";

export interface SessionData {
  mode: SessionMode;
  // Present only for staff logins (0007). Absent means the owner shared-password
  // session, which has full access. Bound into the SIGNED token, never trusted
  // from a client header, so permission checks can rely on it.
  staffId?: string;
}

const COOKIE_NAME = "hml_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function b64urlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(msg),
  );
  return b64urlEncode(sig);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Signing key for session cookies. SESSION_SECRET is the real config; the
// APP_PASSWORD fallback keeps old deploys working. There is deliberately NO
// static fallback: an environment with neither secret must not mint or accept
// sessions, otherwise cookies become forgeable with a publicly known key.
function sessionSecret(env: Env): string | null {
  return env.SESSION_SECRET || env.APP_PASSWORD || null;
}

// Mint just the signed token value (`<payload>.<sig>`), no cookie wrapper. This
// is the bearer-equivalent secret used by non-cookie clients (desktop). The
// cookie minting below wraps the very same value, so cookie and bearer sessions
// are byte-for-byte the same format and verify through the same path.
export async function mintSessionToken(
  env: Env,
  mode: SessionMode = "live",
  staffId?: string,
): Promise<string> {
  const secret = sessionSecret(env);
  if (!secret) throw new Error("SESSION_SECRET not configured");
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  // Owner sessions stay `<exp>.<mode>` (backward compatible); staff sessions
  // append the staff id as a third, signed segment. staffId is a UUID and never
  // contains a dot, so the inner payload splits cleanly.
  const inner = staffId ? `${exp}.${mode}.${staffId}` : `${exp}.${mode}`;
  const payload = b64urlEncode(new TextEncoder().encode(inner));
  const sig = await hmac(secret, payload);
  return `${payload}.${sig}`;
}

export async function mintSessionCookie(
  env: Env,
  mode: SessionMode = "live",
  staffId?: string,
): Promise<string> {
  const value = await mintSessionToken(env, mode, staffId);
  return `${COOKIE_NAME}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_SECONDS}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

// Bearer transport for non-cookie clients (desktop). Same signed token value as
// the cookie carries, just delivered in the Authorization header.
function readBearer(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1] : null;
}

export async function verifySession(
  req: Request,
  env: Env,
): Promise<SessionData | null> {
  // Accept the session from the cookie (web) OR the Authorization header
  // (desktop). Both carry the identical `<payload>.<sig>` token.
  const raw = readCookie(req, COOKIE_NAME) ?? readBearer(req);
  if (!raw) return null;
  const dot = raw.indexOf(".");
  if (dot < 0) return null;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const secret = sessionSecret(env);
  if (!secret) return null;
  const expected = await hmac(secret, payload);
  if (!constantTimeEqual(sig, expected)) return null;
  try {
    const decoded = new TextDecoder().decode(b64urlDecode(payload));
    const [expStr, modeStr, staffId] = decoded.split(".");
    const exp = Number(expStr);
    if (!Number.isFinite(exp)) return null;
    if (exp < Math.floor(Date.now() / 1000)) return null;
    const mode: SessionMode = modeStr === "test" ? "test" : "live";
    return staffId ? { mode, staffId } : { mode };
  } catch {
    return null;
  }
}
