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

interface Body {
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

  const email = normalizeEmail(body.email ?? "");
  const password = (body.password ?? "").trim();
  if (!email || !password) {
    return Response.json({ error: "incorrect email or password" }, { status: 401 });
  }

  const ip = clientIp(ctx.request);
  // Reuse the staff limiter: keyed on IP and the email being targeted.
  if (await isStaffLoginRateLimited(ctx.env, ip, email)) {
    return Response.json(
      { error: "too many attempts, try again later" },
      { status: 429 },
    );
  }

  const client = getServiceClient(ctx.env);
  if (!client) {
    return Response.json({ error: "admin login unavailable" }, { status: 503 });
  }

  const { data } = await client
    .from("admin_accounts")
    .select("id, password_hash, name, email, status")
    .eq("email", email)
    .maybeSingle();

  const admin = data as
    | { id: string; password_hash: string; name: string; email: string; status: string }
    | null;

  // Always run a verify, even with no/disabled account, so response timing does
  // not reveal whether an email exists.
  const PLACEHOLDER =
    "pbkdf2$150000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const stored =
    admin && admin.status === "active" ? admin.password_hash : PLACEHOLDER;
  const ok = await verifyPassword(password, stored);

  if (!admin || admin.status !== "active" || !ok) {
    await recordStaffLoginFailure(ctx.env, ip, email);
    return Response.json({ error: "incorrect email or password" }, { status: 401 });
  }

  const token = await mintAdminSessionToken(ctx.env, admin.id);
  const cookie = await mintAdminSessionCookie(ctx.env, admin.id);
  return new Response(
    JSON.stringify({
      ok: true,
      admin: { id: admin.id, name: admin.name, email: admin.email },
      token,
    }),
    {
      status: 200,
      headers: { "content-type": "application/json", "set-cookie": cookie },
    },
  );
};
