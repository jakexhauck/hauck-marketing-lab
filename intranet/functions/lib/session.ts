import type { Env } from "./env";

// Session helpers, byte-compatible with the Command Center (functions/lib/session.ts).
// Same cookie name, same HMAC-SHA256 signing, same admin token shape, so the same
// SESSION_SECRET validates tokens identically. This app only mints/reads ADMIN
// sessions (the internal hub is admin-only in phase 1).

export interface SessionData {
  adminId?: string;
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
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return b64urlEncode(sig);
}
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function sessionSecret(env: Env): string | null {
  return env.SESSION_SECRET || env.APP_PASSWORD || null;
}

export async function mintAdminSessionToken(env: Env, adminId: string): Promise<string> {
  const secret = sessionSecret(env);
  if (!secret) throw new Error("SESSION_SECRET not configured");
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const inner = JSON.stringify({ e: exp, m: "admin", a: adminId });
  const payload = b64urlEncode(new TextEncoder().encode(inner));
  const sig = await hmac(secret, payload);
  return `${payload}.${sig}`;
}
export async function mintAdminSessionCookie(env: Env, adminId: string): Promise<string> {
  const value = await mintAdminSessionToken(env, adminId);
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

function parseInner(decoded: string): { e: unknown; m?: unknown; a?: unknown } | null {
  if (decoded.startsWith("{")) {
    try { const o = JSON.parse(decoded); return o && typeof o === "object" ? o : null; } catch { return null; }
  }
  const [expStr, modeStr, third] = decoded.split(".");
  if (!expStr || !modeStr) return null;
  if (modeStr === "admin") return { e: expStr, m: "admin", a: third };
  return { e: expStr, m: modeStr };
}

// Verify a session cookie and return the admin claim, or null. Mirrors the
// Command Center's verify path; we only surface adminId since this app is
// admin-only.
export async function verifySession(req: Request, env: Env): Promise<SessionData | null> {
  const raw = readCookie(req, COOKIE_NAME);
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
    const fields = parseInner(new TextDecoder().decode(b64urlDecode(payload)));
    if (!fields) return null;
    const exp = Number(fields.e);
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
    if (fields.a) return { adminId: String(fields.a) };
    return null;
  } catch {
    return null;
  }
}
