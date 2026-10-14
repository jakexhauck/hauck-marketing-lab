import type { Env, ApiData } from "../../lib/env";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";
import { hashPassword, verifyPassword } from "../../lib/password";

// Change the signed-in user's own password / PIN. Two cases, both verify the
// CURRENT password before writing a new hash:
//
//   staff session  -> staff_accounts.password_hash for that staff row.
//   owner session  -> tenants.owner_password_hash (promoting an APP_PASSWORD
//                     fallback client to a per-tenant hash on first change).
//
// The shared-password mode (Made Better) is rejected: that login uses the
// TEST_APP_PASSWORD env var, which is not a per-tenant secret and cannot be
// rotated from the app.

interface Body {
  currentPassword?: unknown;
  newPassword?: unknown;
}

const MIN_LEN = 4;
const MAX_LEN = 200;

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (
  ctx,
) => {
  if (ctx.data.tenant.mode === "test") {
    return Response.json({ error: "not_available_in_test" }, { status: 400 });
  }

  let body: Body = {};
  try {
    body = (await ctx.request.json()) as Body;
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const current = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const next = typeof body.newPassword === "string" ? body.newPassword.trim() : "";
  if (next.length < MIN_LEN || next.length > MAX_LEN) {
    return Response.json({ error: "weak_password" }, { status: 400 });
  }
  if (next === current) {
    return Response.json({ error: "same_password" }, { status: 400 });
  }

  const client = getServiceClient(ctx.env);
  if (!client) {
    return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  }

  // Staff session: rotate that staff member's own password.
  const staff = ctx.data.staff;
  if (staff) {
    const { data } = await client
      .from("staff_accounts")
      .select("password_hash")
      .eq("id", staff.id)
      .maybeSingle();
    const hash = (data as { password_hash?: string } | null)?.password_hash;
    if (!hash || !(await verifyPassword(current, hash))) {
      return Response.json({ error: "incorrect_password" }, { status: 401 });
    }
    const newHash = await hashPassword(next);
    const { error } = await client
      .from("staff_accounts")
      .update({ password_hash: newHash })
      .eq("id", staff.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  // Owner (shared-password) session: rotate tenants.owner_password_hash. Verify
  // current against the existing hash, or the APP_PASSWORD fallback when the
  // client has never set their own.
  if (ctx.data.isOwner !== true) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: tenantRow } = await client
    .from("tenants")
    .select("id, owner_password_hash")
    .eq("slug", ctx.data.tenant.slug)
    .maybeSingle();
  const row = tenantRow as { id?: string; owner_password_hash?: string } | null;

  let ok: boolean;
  if (row?.owner_password_hash) {
    ok = await verifyPassword(current, row.owner_password_hash);
  } else if (ctx.env.APP_PASSWORD) {
    ok = current === ctx.env.APP_PASSWORD;
  } else {
    return Response.json({ error: "no_password_set" }, { status: 500 });
  }
  if (!ok) {
    return Response.json({ error: "incorrect_password" }, { status: 401 });
  }

  const tenantId = row?.id ?? (await resolveTenantId(client, ctx.data.tenant.slug));
  if (!tenantId) {
    return Response.json({ error: "tenant_not_found" }, { status: 500 });
  }
  const newHash = await hashPassword(next);
  const { error } = await client
    .from("tenants")
    .update({ owner_password_hash: newHash })
    .eq("id", tenantId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
};
