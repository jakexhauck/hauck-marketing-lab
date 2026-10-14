import type { Env } from "../../lib/env";
import { mintAdminSessionCookie, mintAdminSessionToken } from "../../lib/session";
import {
  clientIp,
  isStaffLoginRateLimited,
  recordStaffLoginFailure,
} from "../../lib/ratelimit";
import { getServiceClient } from "../../lib/supabase";
import { verifyPassword } from "../../lib/password";
import { normalizeEmail } from "../../lib/staff";
import { isAdminRole, normalizeUsername } from "../../lib/adminRoles";

interface Body {
  // The login handle since 0051. `email` is still read so an older client (or a
  // bookmarked form) keeps working.
  username?: string;
  email?: string;
  password?: string;
}

// POST /api/auth/admin-login  (public)
// Email + password login for super-admins (0008). Resolves an admin_accounts row
// and mints a session whose signed token carries the admin id, which the
// middleware turns into cross-tenant authority on /api/admin/* routes. Distinct
// from the owner and staff logins: it is NOT tenant-scoped.
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  let body: Body = {};
  try {
    body = (await ctx.request.json()) as Body;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const handle = normalizeUsername(body.username ?? body.email ?? "");
  const password = (body.password ?? "").trim();
  if (!handle || !password) {
    return Response.json({ error: "incorrect username or password" }, { status: 401 });
  }

  const ip = clientIp(ctx.request);
  // Reuse the staff limiter: keyed on IP and the handle being targeted.
  if (await isStaffLoginRateLimited(ctx.env, ip, handle)) {
    return Response.json(
      { error: "too many attempts, try again later" },
      { status: 429 },
    );
  }

  const client = getServiceClient(ctx.env);
  if (!client) {
    return Response.json({ error: "admin login unavailable" }, { status: 503 });
  }

  // Username first, then email: an account may have no email at all now, and a
  // handle that looks like an address is still tried both ways.
  const COLUMNS = "id, password_hash, name, email, username, status, role";
  let found = await client
    .from("admin_accounts")
    .select(COLUMNS)
    .eq("username", handle)
    .maybeSingle();
  if (!found.data && handle.includes("@")) {
    found = await client
      .from("admin_accounts")
      .select(COLUMNS)
      .eq("email", normalizeEmail(handle))
      .maybeSingle();
  }
  const { data } = found;

  const admin = data as
    | {
        id: string;
        password_hash: string;
        name: string;
        email: string | null;
        username: string | null;
        status: string;
        role: string;
      }
    | null;

  // Always run a verify, even with no/disabled account, so response timing does
  // not reveal whether an email exists.
  const PLACEHOLDER =
    "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const stored =
    admin && admin.status === "active" ? admin.password_hash : PLACEHOLDER;
  const ok = await verifyPassword(password, stored);

  if (!admin || admin.status !== "active" || !ok) {
    await recordStaffLoginFailure(ctx.env, ip, handle);
    return Response.json({ error: "incorrect username or password" }, { status: 401 });
  }

  // Stamp the sign-in so the roster can answer "is this person actually using
  // it". Best-effort: a failed stamp must never block a valid login.
  ctx.waitUntil(
    (async () => {
      const { error } = await client
        .from("admin_accounts")
        .update({ last_login_at: new Date().toISOString() })
        .eq("id", admin.id);
      if (error) console.warn("[admin-login] last_login_at not stamped", error.message);
    })(),
  );

  const role = isAdminRole(admin.role) ? admin.role : "cold_caller";
  const token = await mintAdminSessionToken(ctx.env, admin.id);
  const cookie = await mintAdminSessionCookie(ctx.env, admin.id, ctx.request);
  return new Response(
    JSON.stringify({
      ok: true,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        username: admin.username,
        role,
      },
      token,
    }),
    {
      status: 200,
      headers: { "content-type": "application/json", "set-cookie": cookie },
    },
  );
};
