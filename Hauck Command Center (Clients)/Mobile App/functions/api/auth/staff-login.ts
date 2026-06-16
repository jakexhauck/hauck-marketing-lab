import type { Env } from "../../lib/env";
import { liveTenantSlug, testTenantSlug } from "../../lib/env";
import {
  mintSessionCookie,
  mintSessionToken,
  type SessionMode,
} from "../../lib/session";
import {
  clientIp,
  isStaffLoginRateLimited,
  recordStaffLoginFailure,
} from "../../lib/ratelimit";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";
import { verifyPassword } from "../../lib/password";
import { normalizeEmail, type StaffRecord } from "../../lib/staff";

interface Body {
  email?: string;
  password?: string;
  mode?: SessionMode;
}

// POST /api/auth/staff-login  (public)
// Email + password login for staff accounts (0007). Distinct from the owner
// shared-password login: it resolves a staff_accounts row and mints a session
// whose signed token carries the staff id, which the middleware turns into
// per-surface permission enforcement.
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  let body: Body = {};
  try {
    body = (await ctx.request.json()) as Body;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const email = normalizeEmail(body.email ?? "");
  const password = (body.password ?? "").trim();
  const mode: SessionMode = body.mode === "test" ? "test" : "live";
  if (!email || !password) {
    return Response.json({ error: "incorrect email or password" }, { status: 401 });
  }

  const ip = clientIp(ctx.request);
  if (await isStaffLoginRateLimited(ctx.env, ip, email)) {
    return Response.json(
      { error: "too many attempts, try again later" },
      { status: 429 },
    );
  }

  const client = getServiceClient(ctx.env);
  if (!client) {
    return Response.json({ error: "staff login unavailable" }, { status: 503 });
  }

  const slug = mode === "test" ? testTenantSlug(ctx.env) : liveTenantSlug(ctx.env);
  const tenantId = await resolveTenantId(client, slug);
  if (!tenantId) {
    return Response.json({ error: "incorrect email or password" }, { status: 401 });
  }

  const { data } = await client
    .from("staff_accounts")
    .select("id, tenant_id, ghl_user_id, email, name, role, status, created_at, updated_at")
    .eq("tenant_id", tenantId)
    .eq("email", email)
    .maybeSingle();

  const staff = data as StaffRecord | null;

  // Always run a verify, even with no/disabled account, so response timing does
  // not reveal whether an email exists.
  const PLACEHOLDER = "pbkdf2$150000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const stored = staff && staff.status === "active" ? await storedHash(client, staff.id) : PLACEHOLDER;
  const ok = await verifyPassword(password, stored);

  if (!staff || staff.status !== "active" || !ok) {
    await recordStaffLoginFailure(ctx.env, ip, email);
    return Response.json({ error: "incorrect email or password" }, { status: 401 });
  }

  const token = await mintSessionToken(ctx.env, mode, staff.id);
  const cookie = await mintSessionCookie(ctx.env, mode, staff.id);
  return new Response(
    JSON.stringify({ ok: true, mode, token, staff: { id: staff.id, name: staff.name, role: staff.role } }),
    {
      status: 200,
      headers: { "content-type": "application/json", "set-cookie": cookie },
    },
  );
};

// password_hash is selected separately so it never rides along on the staff row
// elsewhere in the app.
async function storedHash(
  client: ReturnType<typeof getServiceClient>,
  staffId: string,
): Promise<string> {
  if (!client) return "";
  const { data } = await client
    .from("staff_accounts")
    .select("password_hash")
    .eq("id", staffId)
    .maybeSingle();
  return (data as { password_hash?: string } | null)?.password_hash ?? "";
}
