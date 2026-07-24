import type { Env, ApiData } from "../../lib/env";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";
import type { GhlContext } from "../../lib/ghl";
import { loadTrackerData } from "../../lib/leadTrackerData";
import type { ClientLeadStatus } from "../../lib/leadStatus";
import {
  isFollowUpStatus,
  loadAppointmentsByContact,
  loadFollowUpTasks,
  needsAppointmentWhen,
  pickAppointment,
  type LeadWhen,
  type WhenEvent,
  type WhenTask,
} from "../../lib/leadWhen";
import {
  breakdown,
  rangeStart,
  rollup,
  type BreakdownLevel,
  type TrackerRange,
} from "../../lib/adTrackerMetrics";

// GET /api/ads/tracker?range=all|7|30|90&level=campaign|adset|ad
//   -> { range, level, kpis, breakdown, unattributed, leads, currency, meta }
//
// The sheet's Dashboard tab (RESULTS + BREAKDOWN) and Lead Tracker tab, served
// as one payload. Same arithmetic as the admin Ad Tracker (adTrackerMetrics),
// scoped to the session tenant, plus the per-lead rows the lead list renders.

const RANGES: TrackerRange[] = ["all", "7", "30", "90"];
const LEVELS: BreakdownLevel[] = ["campaign", "adset", "ad"];

// The tracker's client-facing status is Jake's 12-status model, derived from the
// lead's live GHL stage in lib/leadStatus.ts and carried on TrackerLead.
//
// It used to be a 5-bucket rollup computed here from the KPI level. That is gone:
// one definition of the client's status, in one file, so the tracker and any
// future surface cannot drift apart.
export type LeadTrackerStatus = ClientLeadStatus;

// A contact holding a card in the Trash pipeline reads as Lost, unless the lead
// already reached a win. statusForStage maps the Trash stages to "lost" on its
// own, so this only matters for a Trash card whose stage name we do not know.
export function displayStatus(
  status: ClientLeadStatus,
  lost: boolean,
): LeadTrackerStatus {
  if (status === "won") return "won";
  return lost ? "lost" : status;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };

  const url = new URL(ctx.request.url);
  const range = (url.searchParams.get("range") ?? "all") as TrackerRange;
  const level = (url.searchParams.get("level") ?? "ad") as BreakdownLevel;
  if (!RANGES.includes(range)) return Response.json({ error: "bad range" }, { status: 400 });
  if (!LEVELS.includes(level)) return Response.json({ error: "bad level" }, { status: 400 });

  const tenantId = await resolveTenantId(client, t.slug);
  if (!tenantId) return Response.json({ error: "tenant not found" }, { status: 404 });

  const start = rangeStart(range, new Date());

  let data;
  try {
    data = await loadTrackerData(gctx, client, tenantId, t.internal_recipients);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }

  const kpis = rollup(data.leads, data.spendRows, start);
  const rows = breakdown(data.leads, data.spendRows, level, start);
  const unattributed = data.leads.filter(
    (l) => !l.adId && (!start || l.createdAt.slice(0, 10) >= start),
  ).length;

  const baseRows = data.leads
    .filter((l) => !start || l.createdAt.slice(0, 10) >= start)
    .filter((l) => !data.isInternal({ contactId: l.contactId }))
    .map((l) => {
      const c = data.contactById.get(l.contactId);
      const att = data.attributionByContact.get(l.contactId) ?? null;
      const meta = l.adId ? data.adMeta.get(l.adId) : undefined;
      const name =
        c?.contactName?.trim() ||
        [c?.firstName, c?.lastName].filter(Boolean).join(" ").trim() ||
        "Unknown";
      return {
        contactId: l.contactId,
        opportunityId: data.oppIdByContact.get(l.contactId) ?? null,
        name,
        email: c?.email ?? "",
        phone: c?.phone ?? "",
        createdAt: l.createdAt,
        status: displayStatus(l.status, data.lostContacts.has(l.contactId)),
        value: l.value,
        campaignName: att?.campaignName ?? meta?.campaignName ?? null,
        adsetName: att?.adsetName ?? meta?.adsetName ?? null,
        adName: att?.adName ?? meta?.adName ?? null,
        adId: l.adId,
      };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  // The "when" column: an appointment time for the booked statuses, the next
  // open task's due date for the ones we are chasing. Both read live, because a
  // rescheduled appointment or a moved task must not show yesterday's date.
  //
  // Appointments cost one call per calendar for the whole list; tasks cost one
  // call per chased contact, so only the chasing statuses pay for them. Neither
  // is allowed to fail the request: no date beats a wrong date, and beats a 500.
  const now = Date.now();
  const followUpContacts = baseRows
    .filter((r) => isFollowUpStatus(r.status))
    .map((r) => r.contactId);
  const wantsAppointment = baseRows.some((r) => needsAppointmentWhen(r.status));

  const [appointmentsByContact, tasksByContact] = await Promise.all([
    wantsAppointment
      ? loadAppointmentsByContact(gctx, now).catch((err) => {
          console.warn("[ads/tracker] appointment lookup failed", err);
          return new Map<string, WhenEvent[]>();
        })
      : Promise.resolve(new Map<string, WhenEvent[]>()),
    followUpContacts.length > 0
      ? loadFollowUpTasks(gctx, followUpContacts).catch((err) => {
          console.warn("[ads/tracker] task lookup failed", err);
          return new Map<string, WhenTask>();
        })
      : Promise.resolve(new Map<string, WhenTask>()),
  ]);

  const leadRows = baseRows.map((row) => {
    let when: LeadWhen | null = null;
    if (needsAppointmentWhen(row.status)) {
      const picked = pickAppointment(appointmentsByContact.get(row.contactId) ?? [], now);
      if (picked) when = { at: picked.startTime, kind: "appointment", label: picked.title };
    } else if (isFollowUpStatus(row.status)) {
      const task = tasksByContact.get(row.contactId);
      if (task) when = { at: task.dueDate, kind: "follow_up", label: task.title };
    }
    return { ...row, when };
  });

  return Response.json({
    range,
    level,
    kpis,
    breakdown: rows,
    unattributed,
    leads: leadRows,
    currency: "USD",
    meta: {
      opportunities: data.opportunitiesCount,
      spendDays: data.spendRows.length,
      neverSynced: data.spendRows.length === 0,
    },
  });
};
