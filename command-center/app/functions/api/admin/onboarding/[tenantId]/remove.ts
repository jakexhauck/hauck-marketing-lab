import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { logAdminAction } from "../../../../lib/adminAuth";

// POST /api/admin/onboarding/:tenantId/remove
//
// Delete a client from Onboarding (Jake, 2026-09-23): the X on their roster
// row, behind a confirm and a typed DELETE.
//
// Removes the onboarding record only. Their ticks and Setup choices are wiped
// and they are marked 'removed', which takes them off Onboarding and off
// Operations > Clients. The account itself, its data, and their GHL and Meta
// accounts are untouched, so a mistake is one status flip away from undone.
export const onRequestPost: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;

  const { data: tenant } = await client
    .from("tenants")
    .select("id, name, onboarding_status")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant) return Response.json({ error: "not found" }, { status: 404 });

  const { error: tickErr } = await client
    .from("onboarding_checklist")
    .delete()
    .eq("tenant_id", tenantId);
  if (tickErr) return Response.json({ error: tickErr.message }, { status: 500 });

  const { error } = await client
    .from("tenants")
    .update({ onboarding_status: "removed", onboarding_bundle: null, onboarding_dialer: null })
    .eq("id", tenantId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await logAdminAction(client, ctx.data.admin!.id, "onboarding.remove", tenantId, {
    name: (tenant as { name: string }).name,
    was: (tenant as { onboarding_status: string | null }).onboarding_status,
  });

  return Response.json({ ok: true });
};
