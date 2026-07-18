import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { getTenantById, logAdminAction } from "../../../../lib/adminAuth";
import {
  buildBillingUpdate,
  emptyBillingDto,
  toBillingDto,
  type BillingRow,
} from "../../../../lib/clientBilling";

// One client's commercial record for the Fulfillment cockpit's Billing tab.
// Phase 1 is manual entry and this table is the source of truth: nothing here is
// pulled from Stripe/GHL/Meta yet. Auth is enforced upstream in _middleware.ts
// (admin session only); do not re-check it here.
//
// GET   /api/admin/clients/:tenantId/billing -> { billing }
// PATCH /api/admin/clients/:tenantId/billing -> { ok: true, billing }
//
// The row is 1:1 with the tenant (tenant_id unique). A client that has never
// been saved has no row at all: GET returns the empty record rather than
// inserting one, so merely opening the tab does not create rows for every
// client. PATCH upserts, creating the row on the first save.

const COLUMNS =
  "source, date_closed, service, payment_arrangement, upfront_cash, remaining_cash, " +
  "total_cash_collected, billing_date, renewal_date, last_touchpoint, churn_date, " +
  "status, notes, updated_at";

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await getTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  const { data, error } = await client
    .from("client_billing")
    .select(COLUMNS)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    billing: data ? toBillingDto(data as unknown as BillingRow) : emptyBillingDto(),
  });
};

export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await getTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const result = buildBillingUpdate(body);
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });

  const row = {
    ...result.update,
    tenant_id: tenantId,
    updated_at: new Date().toISOString(),
  };

  // Creates the row on the first save, updates it thereafter. tenant_id is
  // unique, so this always targets exactly one row.
  const { data, error } = await client
    .from("client_billing")
    .upsert(row, { onConflict: "tenant_id" })
    .select(COLUMNS)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // No secrets in a billing record, so the update is audited as written.
  await logAdminAction(client, ctx.data.admin!.id, "client.billing.update", tenantId, row);

  return Response.json({
    ok: true,
    billing: data ? toBillingDto(data as unknown as BillingRow) : emptyBillingDto(),
  });
};
