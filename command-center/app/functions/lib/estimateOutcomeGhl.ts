import type { SupabaseClient } from "@supabase/supabase-js";
import { ghlFetch, ghlJson, type GhlContext } from "./ghl";
import { sendConversionEvent } from "./metaCapi";
import type { ContactAppointment } from "./estimateOutcome";

// The GoHighLevel and Meta side effects of an estimate outcome. Everything here
// is best effort except reading the appointments: the outcome is saved in the
// app either way, and a stage that did not move is fixed by hand in a second.

interface RawAppointment {
  id?: string;
  _id?: string;
  calendarId?: string;
  startTime?: string;
  appointmentStatus?: string;
  appoinmentStatus?: string;
  status?: string;
  deleted?: boolean;
}

// One contact's appointments, every calendar. One small call.
export async function fetchContactAppointments(
  gctx: GhlContext,
  contactId: string,
): Promise<ContactAppointment[]> {
  const data = await ghlJson<{ events?: RawAppointment[] }>(
    gctx,
    `/contacts/${encodeURIComponent(contactId)}/appointments`,
  );
  return (data.events ?? [])
    .map((e) => ({
      id: String(e.id ?? e._id ?? ""),
      calendarId: String(e.calendarId ?? ""),
      startTime: String(e.startTime ?? ""),
      status: String(e.appointmentStatus ?? e.appoinmentStatus ?? e.status ?? "booked").toLowerCase(),
      deleted: e.deleted === true,
    }))
    .filter((e) => e.id && e.calendarId);
}

function norm(s: string | undefined): string {
  return String(s ?? "")
    .replace(/[^\x20-\x7e]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

interface Pipeline {
  id: string;
  name?: string;
  stages?: { id: string; name?: string }[];
}

// Move the lead's card in the "Sales Pipeline" to a stage, by name. Returns
// what happened so the caller can log a miss. Never throws.
export async function moveContactStage(
  gctx: GhlContext,
  contactId: string,
  stageName: string,
  extra: { status?: "won" | "lost"; monetaryValue?: number } = {},
): Promise<string> {
  try {
    const [{ pipelines = [] }, { opportunities = [] }] = await Promise.all([
      ghlJson<{ pipelines?: Pipeline[] }>(
        gctx,
        `/opportunities/pipelines?locationId=${encodeURIComponent(gctx.locationId)}`,
      ),
      ghlJson<{ opportunities?: { id: string; pipelineId: string }[] }>(
        gctx,
        `/opportunities/search?location_id=${encodeURIComponent(gctx.locationId)}` +
          `&contact_id=${encodeURIComponent(contactId)}&limit=100`,
      ),
    ]);
    const pipeline =
      pipelines.find((p) => norm(p.name) === "sales pipeline") ??
      pipelines.find((p) => norm(p.name).includes("sales"));
    if (!pipeline) return "no sales pipeline";
    const stage = (pipeline.stages ?? []).find((s) => norm(s.name) === norm(stageName));
    if (!stage) return `no "${stageName}" stage`;
    const opp = opportunities.find((o) => o.pipelineId === pipeline.id);
    if (!opp) return "no opportunity in the sales pipeline";

    const body: Record<string, unknown> = { pipelineId: pipeline.id, pipelineStageId: stage.id };
    if (extra.status) body.status = extra.status;
    if (extra.monetaryValue !== undefined) body.monetaryValue = extra.monetaryValue;
    const res = await ghlFetch(gctx, `/opportunities/${encodeURIComponent(opp.id)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    return res.ok ? "moved" : `move ${res.status}`;
  } catch (err) {
    return `move failed: ${String(err).slice(0, 120)}`;
  }
}

// Tell Meta a lead bought: a Purchase with the job's value, to the client's own
// dataset (Client > GHL > CAPI, table client_capi). Sent once per estimate
// (capi_sent ledger), at the moment the owner taps Sold, which is always inside
// Meta's seven-day window. No dataset or token saved means nothing is sent.
export async function reportSaleToMeta(
  client: SupabaseClient,
  tenantId: string,
  appointmentId: string,
  amountCents: number,
  who: { email?: string; phone?: string; firstName?: string; lastName?: string; city?: string; state?: string; zip?: string },
): Promise<string> {
  const { data: capi } = await client
    .from("client_capi")
    .select("dataset_id, access_token")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const datasetId = String((capi as { dataset_id?: string } | null)?.dataset_id ?? "").trim();
  const token = String((capi as { access_token?: string } | null)?.access_token ?? "").trim();
  if (!datasetId || !token) return "no dataset";

  const funnel = `tenant:${tenantId}`;
  const eventId = `estimate:${appointmentId}`;
  const { data: sent } = await client
    .from("capi_sent")
    .select("id")
    .eq("funnel", funnel)
    .eq("event_name", "Purchase")
    .eq("event_id", eventId)
    .maybeSingle();
  if (sent) return "already sent";

  const result = await sendConversionEvent(token, { pixelId: datasetId, origins: [] }, "Purchase", {
    eventId,
    eventTime: Math.floor(Date.now() / 1000),
    who: { ...who, country: "us" },
    signals: {},
    actionSource: "system_generated",
    customData: { value: amountCents / 100, currency: "USD" },
  });
  await client.from("capi_sent").upsert(
    {
      funnel,
      event_name: "Purchase",
      event_id: eventId,
      tenant_id: tenantId,
      ok: result.ok,
      detail: result.ok ? null : [result.error, result.errorDetail].filter(Boolean).join(" | ").slice(0, 500),
    },
    { onConflict: "funnel,event_name,event_id" },
  );
  return result.ok ? "sent" : `meta refused: ${result.error ?? result.status}`;
}
