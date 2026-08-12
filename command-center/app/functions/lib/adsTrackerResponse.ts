import type { SupabaseClient } from "@supabase/supabase-js";
import type { GhlContext } from "./ghl";
import { loadTrackerData } from "./leadTrackerData";
import type { ClientLeadStatus } from "./leadStatus";
import {
  isFollowUpStatus,
  loadAppointmentsByContact,
  loadFollowUpTasks,
  needsAppointmentWhen,
  pickAppointment,
  type LeadWhen,
  type WhenEvent,
  type WhenTask,
} from "./leadWhen";
import {
  breakdown,
  lastSpendDate,
  rangeStart,
  rollup,
  type BreakdownLevel,
  type TrackerRange,
} from "./adTrackerMetrics";

// The one Paid Ads tracker payload, shared by the client's own page and the
// admin cockpit's view of that client.
//
// It used to live inline in api/ads/tracker.ts, while
// api/admin/clients/:tenantId/ad-tracker.ts hand-rolled a narrower version of
// the same thing. They agreed on the arithmetic (both called adTrackerMetrics)
// and on nothing else: the admin route never returned the `leads` array, and it
// re-implemented the GHL pipeline/contact fetch that loadTrackerData already
// does. Two implementations of one payload is how the two surfaces drifted, so
// there is now one, and the routes differ only in how they name the tenant.

const RANGES: TrackerRange[] = ["all", "7", "30", "90"];
const LEVELS: BreakdownLevel[] = ["campaign", "adset", "ad"];

// The tracker's client-facing status is Jake's 12-status model, derived from the
// lead's live GHL stage in lib/leadStatus.ts and carried on TrackerLead.
export type LeadTrackerStatus = ClientLeadStatus;

// A contact holding a card in the Trash pipeline reads as Lost, unless the lead
// already reached a win. statusForStage maps the Trash stages to "lost" on its
// own, so this only matters for a Trash card whose stage name we do not know.
export function displayStatus(status: ClientLeadStatus, lost: boolean): LeadTrackerStatus {
  if (status === "won") return "won";
  return lost ? "lost" : status;
}

// Read and validate ?range= and ?level=. Returns an error string rather than a
// Response so the caller owns its own status codes.
export function parseTrackerParams(
  url: URL,
): { range: TrackerRange; level: BreakdownLevel } | { error: string } {
  const range = (url.searchParams.get("range") ?? "all") as TrackerRange;
  const level = (url.searchParams.get("level") ?? "ad") as BreakdownLevel;
  if (!RANGES.includes(range)) return { error: "bad range" };
  if (!LEVELS.includes(level)) return { error: "bad level" };
  return { range, level };
}

export interface TrackerResponseInput {
  client: SupabaseClient;
  gctx: GhlContext;
  tenantId: string;
  // Staff phone numbers / emails whose contacts are dropped from the lead list
  // and its counts. Null for a tenant that has never named any.
  internalRecipients: string | null;
  range: TrackerRange;
  level: BreakdownLevel;
}

export async function buildTrackerResponse(input: TrackerResponseInput) {
  const { client, gctx, tenantId, internalRecipients, range, level } = input;
  const start = rangeStart(range, new Date());

  const data = await loadTrackerData(gctx, client, tenantId, internalRecipients);

  // Drop staff contacts ONCE, before anything counts them. This filter used to
  // sit only on the lead rows below, so Willis Windows showed "Leads 35" in
  // Results above a table listing 34: a client who counts the rows got a
  // different answer from the tile telling them how many they had. The KPI row,
  // the breakdown and the table all have to be computed from the same leads.
  const leads = data.leads.filter((l) => !data.isInternal({ contactId: l.contactId }));

  const kpis = rollup(leads, data.spendRows, start);
  const rows = breakdown(leads, data.spendRows, level, start, data.entities);

  // Leads inside the window that carry no ad id. Surfaced so the KPI row and
  // the breakdown never look like they disagree: the breakdown is always the
  // attributed subset.
  const unattributed = leads.filter(
    (l) => !l.adId && (!start || l.createdAt.slice(0, 10) >= start),
  ).length;

  const baseRows = leads
    .filter((l) => !start || l.createdAt.slice(0, 10) >= start)
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

  return {
    range,
    level,
    kpis,
    breakdown: rows,
    unattributed,
    leads: leadRows,
    // Every Hauck client is USD; the sheet's GBP was the template's.
    currency: "USD",
    meta: {
      opportunities: data.opportunitiesCount,
      spendDays: data.spendRows.length,
      // True when nothing has ever been snapshotted, which reads identically to
      // "no spend" on the page. The UI uses it to say which.
      neverSynced: data.spendRows.length === 0,
      // See lastSpendDate(): every cost and ROAS figure divides by spend, so a
      // snapshot running days behind is wrong rather than merely incomplete.
      lastSpendDate: lastSpendDate(data.spendRows),
      // The campaigns the breakdown is scoped to. Empty means it is showing
      // everything, either because nothing is live or because no structure has
      // been synced yet. The page has to say which, since Results above it is
      // never scoped and the two columns will not otherwise add up.
      liveCampaigns: data.entities.filter((e) => e.level === "campaign" && e.live).map((e) => e.name),
    },
  };
}
