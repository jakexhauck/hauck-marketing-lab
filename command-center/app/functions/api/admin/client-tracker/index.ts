import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { isRetiredTenant } from "../../../lib/retiredTenant";
import {
  BILLING_COLUMNS,
  emptyBillingDto,
  toBillingDto,
  type BillingRow,
} from "../../../lib/clientBilling";

// GET /api/admin/client-tracker  (admin-only, gated in _middleware.ts)
//
// Operations > Clients: the Client Tracker Google Sheet, one row per client
// we have right now. Each row is that client's client_billing record (the
// same one Management's Billing cards edit), and saves go through the
// existing PATCH /api/admin/clients/:tenantId/billing, so this is read only.
//
// Who counts: every tenant except a retired one, one deleted from Onboarding
// (status 'removed'), and the agency's own "hauck-marketing" account, which
// is Hauck Marketing's sub-account and not a client.

const NOT_CLIENTS = new Set(["hauck-marketing"]);

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data: tenants, error } = await client
    .from("tenants")
    .select("id, slug, name, brand_color, brand_initials, onboarding_status, created_at")
    .order("created_at", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const current = (
    (tenants ?? []) as {
      id: string;
      slug: string;
      name: string;
      brand_color: string | null;
      brand_initials: string | null;
      onboarding_status: string | null;
    }[]
  ).filter(
    (t) => !isRetiredTenant(t) && !NOT_CLIENTS.has(t.slug) && t.onboarding_status !== "removed",
  );

  const { data: rows, error: billErr } = await client
    .from("client_billing")
    .select(`tenant_id, ${BILLING_COLUMNS}`)
    .in(
      "tenant_id",
      current.map((t) => t.id),
    );
  if (billErr) return Response.json({ error: billErr.message }, { status: 500 });

  const byTenant = new Map(
    ((rows ?? []) as unknown as (BillingRow & { tenant_id: string })[]).map((r) => [r.tenant_id, r]),
  );

  return Response.json({
    clients: current.map((t) => {
      const row = byTenant.get(t.id);
      return {
        tenantId: t.id,
        name: t.name,
        brandColor: t.brand_color ?? "",
        brandInitials: t.brand_initials ?? "",
        billing: row ? toBillingDto(row) : emptyBillingDto(),
      };
    }),
  });
};
