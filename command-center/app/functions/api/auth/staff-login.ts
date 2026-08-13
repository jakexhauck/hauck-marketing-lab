import type { Env } from "../../lib/env";
import { testTenantSlug } from "../../lib/env";
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
// Email + password login for every person on a client team, owners included
// (an owner is a staff_accounts row with role 'owner'). The email identifies
// the client: one URL serves every client and the account decides which one you
// see. The minted token carries both the tenant id and the staff id, which the
// middleware turns into client scoping + per-surface permission enforcement.
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

  // Account-based resolution: the email decides which client this person belongs
  // to (emails are globally unique across staff_accounts — see migration 0010).
  // The shared-password mode stays pinned to its single tenant (Made Better
  // Landscaping Co) so those logins never reach another client's data.
  const STAFF_COLS =
    "id, tenant_id, ghl_user_id, email, name, role, status, created_at, updated_at";
  let staff: StaffRecord | null;
  if (mode === "test") {
    const testTenantId = await resolveTenantId(client, testTenantSlug(ctx.env));
    if (!testTenantId) {
      return Response.json({ error: "incorrect email or password" }, { status: 401 });
    }
    const { data } = await client
      .from("staff_accounts")
      .select(STAFF_COLS)
      .eq("tenant_id", testTenantId)
      .eq("email", email)
      .maybeSingle();
    staff = data as StaffRecord | null;
  } else {
    const { data } = await client
      .from("staff_accounts")
      .select(STAFF_COLS)
      .eq("email", email)
      .maybeSingle();
    staff = data as StaffRecord | null;
  }

  // Always run a verify, even with no/disabled account, so response timing does
  // not reveal whether an email exists.
  const PLACEHOLDER = "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const stored = staff && staff.status === "active" ? await storedHash(client, staff.id) : PLACEHOLDER;
  const ok = await verifyPassword(password, stored);

  if (!staff || staff.status !== "active" || !ok) {
    await recordStaffLoginFailure(ctx.env, ip, email);
    return Response.json({ error: "incorrect email or password" }, { status: 401 });
  }

  const claims = { tenantId: staff.tenant_id, staffId: staff.id };
  const token = await mintSessionToken(ctx.env, mode, claims);
  const cookie = await mintSessionCookie(ctx.env, mode, claims, ctx.request);
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
