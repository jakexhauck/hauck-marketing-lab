import type { Env } from "./env";

export type SessionMode = "live" | "test";

export interface SessionData {
  mode: SessionMode;
  // The client (tenant) this session is scoped to. Set at login from the
  // account, NOT from the request host: one URL serves every client and the
  // logged-in account decides which one they see. Bound into the SIGNED token.
  // Absent on legacy single-tenant sessions, where the middleware falls back to
  // the request host / TENANT_SLUG env var.
  tenantId?: string;
  // Present only for staff logins (0007). Absent means the owner shared-password
  // session, which has full access. Bound into the SIGNED token, never trusted
  // from a client header, so permission checks can rely on it.
  staffId?: string;
  // Present only for super-admin logins (0008). Bound into the SIGNED token like
  // staffId. A session is never both staff and admin. An admin session is the
  // only thing that may reach the cross-tenant /api/admin/* routes.
  adminId?: string;
  // Preview-as-client (Plan 05): an admin impersonating one client's view,
  // read-only. Such a token carries BOTH adminId (who is previewing, so the
  // session can be restored on exit) AND tenantId (whose view). The middleware
  // serves it as a read-only owner session for that tenant and rejects writes.
  preview?: boolean;
}

// Options carried into a tenant-scoped (non-admin) session.
export interface SessionClaims {
  tenantId?: string;
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

// Serialize the inner payload as compact JSON, dropping empty claims. The token
// used to be dot-delimited (`<exp>.<mode>[.<id>]`); JSON lets a session carry
// both a tenantId and a staffId without segment-position ambiguity. verifySession
// still accepts the old dot format so sessions minted before this change keep
// working for their 30-day life.
function encodeInner(fields: Record<string, unknown>): string {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null && v !== "") clean[k] = v;
  }
  return JSON.stringify(clean);
}

// Mint just the signed token value (`<payload>.<sig>`), no cookie wrapper. This
// is the bearer-equivalent secret used by non-cookie clients (desktop). The
// cookie minting below wraps the very same value, so cookie and bearer sessions
// are byte-for-byte the same format and verify through the same path.
export async function mintSessionToken(
  env: Env,
  mode: SessionMode = "live",
  claims: SessionClaims = {},
): Promise<string> {
  const secret = sessionSecret(env);
  if (!secret) throw new Error("SESSION_SECRET not configured");
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const inner = encodeInner({
    e: exp,
    m: mode,
    t: claims.tenantId,
    s: claims.staffId,
  });
  const payload = b64urlEncode(new TextEncoder().encode(inner));
  const sig = await hmac(secret, payload);
  return `${payload}.${sig}`;
}

export async function mintSessionCookie(
  env: Env,
  mode: SessionMode = "live",
  claims: SessionClaims = {},
): Promise<string> {
  const value = await mintSessionToken(env, mode, claims);
  return `${COOKIE_NAME}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_SECONDS}`;
}

// Admin sessions use the literal "admin" in the mode slot so they can never be
// confused with a live/test tenant session, and carry the adminId as the third
// segment. Same signing path, same verification, so forgery is no easier than
// for any other session. mode is nominally "live" once decoded (admins are not
// tenant-scoped; the value is unused by /api/admin/* routes).
export async function mintAdminSessionToken(
  env: Env,
  adminId: string,
): Promise<string> {
  const secret = sessionSecret(env);
  if (!secret) throw new Error("SESSION_SECRET not configured");
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const inner = encodeInner({ e: exp, m: "admin", a: adminId });
  const payload = b64urlEncode(new TextEncoder().encode(inner));
  const sig = await hmac(secret, payload);
  return `${payload}.${sig}`;
}

export async function mintAdminSessionCookie(
  env: Env,
  adminId: string,
): Promise<string> {
  const value = await mintAdminSessionToken(env, adminId);
  return `${COOKIE_NAME}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_SECONDS}`;
}

// Preview-as-client sessions (Plan 05). The token carries the previewing admin
// (a) AND the previewed client (t) AND a preview flag (p), all signed. mode is
// "live" so the previewed view reads real data. verifySession returns it with
// preview=true; the middleware then serves it as a read-only owner session for
// that tenant and forbids any non-GET method. Shorter-lived than a normal
// session: a preview is a transient act, not a standing login.
const PREVIEW_MAX_AGE_SECONDS = 60 * 60 * 2;

export async function mintPreviewSessionToken(
  env: Env,
  adminId: string,
  tenantId: string,
  // Optional: preview AS a specific staff member, so the previewed view applies
  // that person's exact role + per-surface permissions (not the full owner view).
  // Absent means the owner's-eye view of the client.
  staffId?: string,
): Promise<string> {
  const secret = sessionSecret(env);
  if (!secret) throw new Error("SESSION_SECRET not configured");
  const exp = Math.floor(Date.now() / 1000) + PREVIEW_MAX_AGE_SECONDS;
  const inner = encodeInner({ e: exp, m: "live", t: tenantId, a: adminId, p: 1, s: staffId });
  const payload = b64urlEncode(new TextEncoder().encode(inner));
  const sig = await hmac(secret, payload);
  return `${payload}.${sig}`;
}

export async function mintPreviewSessionCookie(
  env: Env,
  adminId: string,
  tenantId: string,
  staffId?: string,
): Promise<string> {
  const value = await mintPreviewSessionToken(env, adminId, tenantId, staffId);
  return `${COOKIE_NAME}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${PREVIEW_MAX_AGE_SECONDS}`;
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
    const fields = parseInner(decoded);
    if (!fields) return null;
    const exp = Number(fields.e);
    if (!Number.isFinite(exp)) return null;
    if (exp < Math.floor(Date.now() / 1000)) return null;
    // Preview-as-client: carries adminId, tenantId and the preview flag. Returned
    // with preview=true so the middleware serves it read-only for that tenant. An
    // optional staffId (s) narrows it to that person's POV: the middleware then
    // resolves their permissions and gates surfaces exactly as they would see.
    if (fields.a && fields.p && fields.t) {
      const data: SessionData = {
        mode: "live",
        adminId: String(fields.a),
        tenantId: String(fields.t),
        preview: true,
      };
      if (fields.s) data.staffId = String(fields.s);
      return data;
    }
    // Admin session: carries an adminId, no tenant. mode is nominal (unused by
    // admin routes).
    if (fields.a) return { mode: "live", adminId: String(fields.a) };
    const mode: SessionMode = fields.m === "test" ? "test" : "live";
    const data: SessionData = { mode };
    if (fields.t) data.tenantId = String(fields.t);
    if (fields.s) data.staffId = String(fields.s);
    return data;
  } catch {
    return null;
  }
}

// Decode the inner payload into a flat claims bag. New tokens are JSON
// (`{e,m,t?,s?,a?}`); pre-JSON tokens are dot-delimited (`<exp>.<mode>[.<id>]`,
// where the id is a staffId, or an adminId when mode is "admin"). Returns null
// if neither shape parses.
function parseInner(
  decoded: string,
): { e: unknown; m?: unknown; t?: unknown; s?: unknown; a?: unknown; p?: unknown } | null {
  if (decoded.startsWith("{")) {
    try {
      const obj = JSON.parse(decoded);
      return obj && typeof obj === "object" ? obj : null;
    } catch {
      return null;
    }
  }
  const [expStr, modeStr, third] = decoded.split(".");
  if (!expStr || !modeStr) return null;
  if (modeStr === "admin") return { e: expStr, m: "admin", a: third };
  return { e: expStr, m: modeStr, s: third };
}
