// Who is allowed to change her hours and prices.
//
// This is a smaller gate than the booking endpoint's, and it guards something
// bigger: /api/book can add one appointment, /api/admin can close her book for
// a year. So it is a shared passcode AND Turnstile on the way in, then a signed
// cookie so she is not retyping it on her phone every visit.
//
// The cookie carries no data worth stealing: an expiry and a signature over it.
// Nothing here trusts a value the browser sent without checking that signature.

const COOKIE = "jm_hours";
const SESSION_DAYS = 30;

export interface AdminEnv {
  // The passcode she is given once. Absent means the admin page is off, and
  // every route refuses, which is the right way to fail.
  HOURS_PASSCODE?: string;
  // Reused as the signing key. It already exists, it is already secret, and a
  // second secret to rotate is a second secret to forget.
  ADMIN_KEY?: string;
}

// Both arguments are compared in full regardless of where they differ, so the
// time taken says nothing about how much of the passcode was right.
export function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const left = enc.encode(a);
  const right = enc.encode(b);
  // Lengths differ: still walk the longer one, then fail.
  const len = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < len; i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

async function sign(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function issueSession(env: AdminEnv, nowMs: number): Promise<string> {
  const expires = nowMs + SESSION_DAYS * 24 * 3600_000;
  const signature = await sign(env.ADMIN_KEY ?? "", String(expires));
  return `${expires}.${signature}`;
}

export async function sessionIsValid(env: AdminEnv, token: string | null, nowMs: number): Promise<boolean> {
  if (!env.ADMIN_KEY || !token) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature) return false;
  const at = Number(expires);
  if (!Number.isFinite(at) || at < nowMs) return false;
  return constantTimeEqual(signature, await sign(env.ADMIN_KEY, expires));
}

export function readCookie(header: string | null, name = COOKIE): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=") || null;
  }
  return null;
}

export function sessionCookie(token: string): string {
  // HttpOnly so a script on the page cannot read it, Strict so it is not sent
  // from anywhere else, Secure because the whole site is https.
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * 24 * 3600}`;
}

export function clearedCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

// Every admin route starts with this. Returns a Response to send back, or null
// to carry on.
export async function requireAdmin(request: Request, env: AdminEnv): Promise<Response | null> {
  if (!env.HOURS_PASSCODE || !env.ADMIN_KEY) {
    return new Response(JSON.stringify({ error: "The hours page is not set up yet" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
  const token = readCookie(request.headers.get("Cookie"));
  if (await sessionIsValid(env, token, Date.now())) return null;

  return new Response(JSON.stringify({ error: "Please sign in again" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
