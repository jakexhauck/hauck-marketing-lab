import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { agencyTimezone } from "../../../../lib/agencyGhl";
import {
  BILLING_COLUMNS,
  buildBillingUpdate,
  emptyBillingDto,
  toBillingDto,
  type BillingRow,
} from "../../../../lib/clientBilling";
import { trackerPrefill } from "../../../../lib/pendingClients";
import { attachPendingClient, PENDING_COLUMNS, type PendingRow } from "../../../../lib/pendingClientsStore";

// The Client Tracker row for one closed meeting (Sales Data's second step, and
// the waiting rows on Operations > Clients).
//
// GET   -> { billing, saved, tenantId }   what the step opens with: the saved
//          row, or a prefill off the meeting when nothing is saved yet. Once
//          the row has moved onto a client it reads that client's billing.
// PATCH -> { ok, billing }                saves the fields sent. Before a
//          client exists they land on pending_clients; after, on client_billing.
// POST  { tenantId } -> { ok }            links the row to a client by hand.
//
// Owner only, the same bar as the post-call form.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CallRow {
  id: string;
  prospect_name: string | null;
  business_name: string | null;
  email: string | null;
  phone: string | null;
  scheduled_at: string | null;
  cash_collected: number | string | null;
}

type Ctx = EventContext<Env, string, ApiData>;

type Setup =
  | { res: Response }
  | { client: SupabaseClient; callId: string; pending: PendingRow | null };

async function setup(ctx: Ctx): Promise<Setup> {
  if (ctx.data.admin?.role !== "owner") {
    return { res: Response.json({ error: "not found" }, { status: 404 }) };
  }
  const client = getServiceClient(ctx.env);
  if (!client) return { res: Response.json({ error: "supabase not configured" }, { status: 503 }) };
  const callId = String(ctx.params.callId ?? "");
  if (!UUID.test(callId)) return { res: Response.json({ error: "bad id" }, { status: 400 }) };

  const { data: pending, error } = await client
    .from("pending_clients")
    .select(PENDING_COLUMNS)
    .eq("sales_call_id", callId)
    .maybeSingle();
  if (error) return { res: Response.json({ error: error.message }, { status: 500 }) };
  return { client, callId, pending: pending as unknown as PendingRow | null };
}

async function readCall(ctx: Ctx, callId: string): Promise<CallRow | null> {
  const client = getServiceClient(ctx.env)!;
  const { data } = await client
    .from("sales_calls")
    .select("id, prospect_name, business_name, email, phone, scheduled_at, cash_collected")
    .eq("id", callId)
    .maybeSingle();
  return (data as CallRow | null) ?? null;
}

async function tenantBilling(ctx: Ctx, tenantId: string) {
  const client = getServiceClient(ctx.env)!;
  const { data } = await client
    .from("client_billing")
    .select(BILLING_COLUMNS)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data ? toBillingDto(data as unknown as BillingRow) : emptyBillingDto();
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const s = await setup(ctx);
  if ("res" in s) return s.res;

  if (s.pending?.tenant_id) {
    return Response.json({
      billing: await tenantBilling(ctx, s.pending.tenant_id),
      saved: true,
      tenantId: s.pending.tenant_id,
    });
  }
  if (s.pending) {
    return Response.json({ billing: toBillingDto(s.pending), saved: true, tenantId: null });
  }

  const call = await readCall(ctx, s.callId);
  if (!call) return Response.json({ error: "meeting not found" }, { status: 404 });
  const cash = call.cash_collected === null ? null : Number(call.cash_collected);
  return Response.json({
    billing: trackerPrefill(
      {
        prospectName: call.prospect_name ?? "",
        scheduledAt: call.scheduled_at,
        cashCollected: Number.isFinite(cash) ? cash : null,
      },
      agencyTimezone(ctx.env),
    ),
    saved: false,
    tenantId: null,
  });
};

export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const s = await setup(ctx);
  if ("res" in s) return s.res;

  let body: unknown;
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const result = buildBillingUpdate(body);
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  const now = new Date().toISOString();

  // Already a client: the tracker row IS their billing record now.
  if (s.pending?.tenant_id) {
    const { error } = await s.client
      .from("client_billing")
      .upsert({ ...result.update, tenant_id: s.pending.tenant_id, updated_at: now }, { onConflict: "tenant_id" });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, billing: await tenantBilling(ctx, s.pending.tenant_id) });
  }

  // The match keys are copied off the meeting on every save, so a phone or
  // email fixed on the meeting later still reaches the match.
  const call = await readCall(ctx, s.callId);
  if (!call) return Response.json({ error: "meeting not found" }, { status: 404 });

  const { data, error } = await s.client
    .from("pending_clients")
    .upsert(
      {
        ...result.update,
        sales_call_id: s.callId,
        business_name: (call.business_name ?? "").trim() || (call.prospect_name ?? "").trim(),
        email: call.email ?? "",
        phone: call.phone ?? "",
        updated_at: now,
      },
      { onConflict: "sales_call_id" },
    )
    .select(PENDING_COLUMNS)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, billing: toBillingDto(data as unknown as PendingRow) });
};

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const s = await setup(ctx);
  if ("res" in s) return s.res;
  if (!s.pending) return Response.json({ error: "nothing saved for this meeting" }, { status: 404 });

  let tenantId = "";
  try {
    const body = (await ctx.request.json()) as { tenantId?: unknown };
    tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  if (!UUID.test(tenantId)) return Response.json({ error: "tenantId is required" }, { status: 400 });

  const { data: tenant } = await s.client.from("tenants").select("id").eq("id", tenantId).maybeSingle();
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  const err = await attachPendingClient(s.client, s.pending, tenantId);
  if (err) return Response.json({ error: err }, { status: 500 });
  return Response.json({ ok: true });
};
