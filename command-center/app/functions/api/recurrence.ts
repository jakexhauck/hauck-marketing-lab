// command-center/app/functions/api/recurrence.ts
import type { Env, ApiData } from "../lib/env";
import { getServiceClient, resolveTenantId } from "../lib/supabase";

export interface ApiRecurrence {
  contactId: string;
  cadenceWeeks: number;
  weekday: number;
  anchorDate: string;
  visitTime: string | null;
  service: string | null;
  priceCents: number | null;
  active: boolean;
}

interface Row {
  contact_id: string;
  cadence_weeks: number;
  weekday: number;
  anchor_date: string;
  visit_time: string | null;
  service: string | null;
  price_cents: number | null;
  active: boolean;
}

function shape(r: Row): ApiRecurrence {
  return {
    contactId: r.contact_id,
    cadenceWeeks: r.cadence_weeks,
    weekday: r.weekday,
    anchorDate: r.anchor_date,
    visitTime: r.visit_time,
    service: r.service,
    priceCents: r.price_cents,
    active: r.active,
  };
}

// GET /api/recurrence -> { recurrences: ApiRecurrence[] } (active rows only)
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ recurrences: [] });
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ recurrences: [] });

  const { data, error } = await client
    .from("customer_recurrence")
    .select("contact_id,cadence_weeks,weekday,anchor_date,visit_time,service,price_cents,active")
    .eq("tenant_id", tenantId)
    .eq("active", true);
  if (error) return Response.json({ recurrences: [] });
  return Response.json({ recurrences: (data as Row[]).map(shape) });
};

// PUT /api/recurrence -> upsert one customer's schedule by (tenant, contactId)
export const onRequestPut: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "unavailable" }, { status: 503 });
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "unavailable" }, { status: 503 });

  const body = (await ctx.request.json().catch(() => null)) as
    | Partial<ApiRecurrence>
    | null;
  const contactId = (body?.contactId ?? "").trim();
  const cadenceWeeks = Math.trunc(Number(body?.cadenceWeeks));
  const weekday = Math.trunc(Number(body?.weekday));
  const anchorDate = (body?.anchorDate ?? "").trim();
  if (
    !contactId ||
    !Number.isFinite(cadenceWeeks) || cadenceWeeks < 1 ||
    !Number.isFinite(weekday) || weekday < 0 || weekday > 6 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)
  ) {
    return Response.json({ error: "invalid recurrence" }, { status: 400 });
  }

  const pc = body?.priceCents == null ? null : Math.trunc(Number(body.priceCents));
  const row = {
    tenant_id: tenantId,
    contact_id: contactId,
    cadence_weeks: cadenceWeeks,
    weekday,
    anchor_date: anchorDate,
    visit_time: body?.visitTime ?? null,
    service: body?.service ?? null,
    price_cents: pc == null || !Number.isFinite(pc) ? null : pc,
    active: body?.active ?? true,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await client
    .from("customer_recurrence")
    .upsert(row, { onConflict: "tenant_id,contact_id" })
    .select("contact_id,cadence_weeks,weekday,anchor_date,visit_time,service,price_cents,active")
    .single();
  if (error) return Response.json({ error: "write failed" }, { status: 500 });
  return Response.json({ recurrence: shape(data as Row) });
};

// DELETE /api/recurrence?contactId=<id> -> deactivate (soft) this schedule
export const onRequestDelete: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ ok: true });
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ ok: true });
  const contactId = new URL(ctx.request.url).searchParams.get("contactId") ?? "";
  if (!contactId) return Response.json({ error: "contactId required" }, { status: 400 });

  const { error } = await client
    .from("customer_recurrence")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("contact_id", contactId);
  if (error) return Response.json({ error: "write failed" }, { status: 500 });
  return Response.json({ ok: true });
};
