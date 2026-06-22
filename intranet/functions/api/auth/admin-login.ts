import type { Env } from "../../lib/env";
import { mintAdminSessionCookie } from "../../lib/session";
import { getServiceClient } from "../../lib/supabase";
import { verifyPassword } from "../../lib/password";

interface Body { email?: string; password?: string }

// POST /api/auth/admin-login  (public)
// Same email + password as the Command Center super-admin login: resolves an
// admin_accounts row in the shared Supabase and mints an admin session cookie
// for internal.hauckmarketing.com. Distinct cookie host, same credentials.
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  let body: Body = {};
  try { body = (await ctx.request.json()) as Body; } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = (body.password ?? "").trim();
  if (!email || !password) {
    return Response.json({ error: "incorrect email or password" }, { status: 401 });
  }

  const client = getServiceClient(ctx.env);
  if (!client) {
    return Response.json({ error: "login unavailable" }, { status: 503 });
  }

  const { data } = await client
    .from("admin_accounts")
    .select("id, password_hash, name, email, status")
    .eq("email", email)
    .maybeSingle();

  const admin = data as
    | { id: string; password_hash: string; name: string; email: string; status: string }
    | null;

  // Always verify against something so timing doesn't reveal whether the email
  // exists (same placeholder pattern as the Command Center).
  const PLACEHOLDER =
    "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const stored = admin && admin.status === "active" ? admin.password_hash : PLACEHOLDER;
  const ok = await verifyPassword(password, stored);

  if (!admin || admin.status !== "active" || !ok) {
    return Response.json({ error: "incorrect email or password" }, { status: 401 });
  }

  const cookie = await mintAdminSessionCookie(ctx.env, admin.id);
  return new Response(
    JSON.stringify({ ok: true, admin: { id: admin.id, name: admin.name, email: admin.email } }),
    { status: 200, headers: { "content-type": "application/json", "set-cookie": cookie } },
  );
};
