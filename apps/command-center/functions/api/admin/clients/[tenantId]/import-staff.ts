import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { logAdminAction } from "../../../../lib/adminAuth";
import { hashPassword } from "../../../../lib/password";
import { listGhlLocationUsers } from "../../../../lib/staff";
import { getGhlContextForTenant, TenantGhlError } from "../../../../lib/tenantGhl";
import type { GhlContext } from "../../../../lib/ghl";

// POST /api/admin/clients/:tenantId/import-staff  (admin-only)
// Pre-populate a client's team from the users GoHighLevel already has on their
// sub-account. Each imported person becomes a staff_accounts row linked by
// ghl_user_id, but DISABLED with an unusable random password: the owner sets a
// real password (and grants) on the Team screen before they can sign in. People
// already imported (matched by email) are skipped, never overwritten.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;

  let gctx: GhlContext;
  try {
    gctx = await getGhlContextForTenant(ctx.env, tenantId);
  } catch (e) {
    if (!(e instanceof TenantGhlError)) throw e;
    // tenant_not_found keeps this route's existing "client not found" wording,
    // which matches every other admin/clients/:tenantId endpoint. The other
    // codes (ghl_not_connected, tenant_lookup_failed, supabase_not_configured)
    // surface the helper's own status and message.
    const error = e.code === "tenant_not_found" ? "client not found" : e.message;
    return Response.json({ error }, { status: e.status });
  }

  const users = await listGhlLocationUsers({
    token: gctx.token,
    locationId: gctx.locationId,
  });
  if (users.length === 0) {
    return Response.json({ imported: 0, skipped: 0, total: 0 });
  }

  // Existing staff emails for this tenant, to skip rather than clobber.
  const { data: existingRows } = await client
    .from("staff_accounts")
    .select("email")
    .eq("tenant_id", tenantId);
  const existing = new Set(
    ((existingRows ?? []) as { email: string }[]).map((r) => r.email.toLowerCase()),
  );

  const fresh = users.filter((u) => !existing.has(u.email));
  let imported = 0;
  for (const u of fresh) {
    // Unusable password: a random secret nobody holds. The owner must set a real
    // one on the Team screen, which also flips the account to active.
    const random = crypto.randomUUID() + crypto.randomUUID();
    const password_hash = await hashPassword(random);
    const { error } = await client.from("staff_accounts").insert({
      tenant_id: tenantId,
      ghl_user_id: u.id,
      email: u.email,
      name: u.name,
      role: "rep",
      password_hash,
      status: "disabled",
    });
    if (!error) imported += 1;
  }

  await logAdminAction(client, ctx.data.admin!.id, "client.import_staff", tenantId, {
    imported,
    skipped: users.length - imported,
  });

  return Response.json({
    imported,
    skipped: users.length - imported,
    total: users.length,
  });
};
