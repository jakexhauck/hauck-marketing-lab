import type { SupabaseClient } from "@supabase/supabase-js";
import type { GhlContext } from "./ghl";
import { loadTrackerData } from "./leadTrackerData";
import {
  manualStatusOrDefault,
  type ClientLeadStatus,
  type ManualLeadStatus,
} from "./leadStatus";
import { loadManualStatuses, loadTrackerJobValues } from "./manualStatusStore";
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
  type TrackerLevel,
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

// Which model the `status` on each lead row belongs to. The two have different
// keys, so the page cannot guess: "auto" is the derived twelve, "manual" is the
// eight the owner types (0102). Sent on every response so the client renders a
// badge or a dropdown from the payload rather than from a build-time constant.
export type TrackerStatusMode = "auto" | "manual";

// Does this lead have a real appointment on the calendar, past or future?
// Cancelled ones do not count; pickAppointment already skips those.
export function hasLiveAppointment(events: WhenEvent[], now: number): boolean {
  return pickAppointment(events, now) !== null;
}

// The typed status, mapped onto the four-rung ladder the KPI arithmetic uses.
//
// One rule is not derived from the status at all: **a lead with a real
// appointment counts as a booking, whatever the owner has since typed.** Only
// the current status is stored, so a lead they mark Lost in March would
// otherwise take February's booking down with it, and the client would watch
// their Bookings figure fall while they worked. The calendar remembers what a
// single typed field cannot.
//
// no_answer stays a plain lead: ringing somebody who did not pick up is not
// contact made, and counting it as a pickup would flatter the pickup rate,
// which is the one number on that page that tells them whether their leads are
// answering the phone.
export function manualLevel(status: ManualLeadStatus, booked: boolean): TrackerLevel {
  if (status === "won") return "sale";
  if (booked || status === "appointment_booked" || status === "quoted") return "booking";
  if (status === "contacted" || status === "follow_up") return "pickup";
  return "lead";
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
  // tenants.manual_lead_status (0102): this client types their own status and
  // their own job values, so both are read from Supabase rather than derived
  // from the GHL stage. Defaults to the derived behaviour.
  manualStatus?: boolean;
}

export async function buildTrackerResponse(input: TrackerResponseInput) {
  const { client, gctx, tenantId, internalRecipients, range, level } = input;
  const manual = input.manualStatus === true;
  const start = rangeStart(range, new Date());

  const [data, typedStatus, typedValues] = await Promise.all([
    loadTrackerData(gctx, client, tenantId, internalRecipients),
    manual ? loadManualStatuses(client, tenantId) : Promise.resolve(new Map<string, ManualLeadStatus>()),
    manual ? loadTrackerJobValues(client, tenantId) : Promise.resolve(new Map<string, number>()),
  ]);

  // Drop staff contacts ONCE, before anything counts them. This filter used to
  // sit only on the lead rows below, so Willis Windows showed "Leads 35" in
  // Results above a table listing 34: a client who counts the rows got a
  // different answer from the tile telling them how many they had. The KPI row,
  // the breakdown and the table all have to be computed from the same leads.
  const rawLeads = data.leads.filter((l) => !data.isInternal({ contactId: l.contactId }));

  // The appointments, fetched once. On a manual tenant they are needed twice:
  // for the date column, and for the booking count below, which is why this
  // moved above the KPI rollup rather than sitting beside the date logic.
  const now = Date.now();
  const wantsAppointment =
    manual || rawLeads.some((l) => needsAppointmentWhen(l.status));
  const appointmentsByContact = wantsAppointment
    ? await loadAppointmentsByContact(gctx, now).catch((err) => {
        console.warn("[ads/tracker] appointment lookup failed", err);
        return new Map<string, WhenEvent[]>();
      })
    : new Map<string, WhenEvent[]>();

  // On a manual tenant the KPI ladder counts from what the owner typed. Leaving
  // it on the GHL stages would put a Bookings figure on the dashboard that
  // disagreed with the tracker one tab away, and the client would be right to
  // believe neither.
  const leads = manual
    ? rawLeads.map((l) => ({
        ...l,
        level: manualLevel(
          manualStatusOrDefault(typedStatus.get(l.contactId)),
          hasLiveAppointment(appointmentsByContact.get(l.contactId) ?? [], now),
        ),
        // Revenue is summed from customer_jobs, and a value typed on the
        // tracker IS a customer_jobs row, so l.value already carries it.
      }))
    : rawLeads;

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
        // On a manual tenant the typed status is the only status. A card in the
        // Trash pipeline no longer forces Lost either: nobody is moving those
        // cards, so a stale one would overrule the owner who just said Won.
        status: manual
          ? manualStatusOrDefault(typedStatus.get(l.contactId))
          : displayStatus(l.status, data.lostContacts.has(l.contactId)),
        // Dollars. The typed job value wins on a manual tenant, since the
        // opportunity's monetaryValue is a number nobody there maintains.
        value: manual
          ? (typedValues.has(l.contactId) ? (typedValues.get(l.contactId) as number) / 100 : null)
          : l.value,
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
  // The appointments were already fetched above (one call per calendar for the
  // whole list). Tasks cost one call per chased contact, so only the chasing
  // statuses pay for them, and neither is allowed to fail the request: no date
  // beats a wrong date, and beats a 500.
  //
  // On a MANUAL tenant the date is never chosen by the status. Choosing by
  // status is right when the status is derived from the same GHL the calendar
  // lives in, and wrong the moment a human types it: a lead they mark
  // "Appointment Booked" before the booking lands would show no date, and one
  // with a real appointment they have marked "Contacted" would hide the date it
  // has. So: always ask the calendar, always show what it says. The status is
  // what the owner thinks, the date is what the calendar knows.
  //
  // Follow-up tasks are skipped there too. They are OUR dialling tasks, and a
  // client working their own leads has none.
  const followUpContacts = manual
    ? []
    : baseRows
        .filter((r) => isFollowUpStatus(r.status as ClientLeadStatus))
        .map((r) => r.contactId);

  const tasksByContact =
    followUpContacts.length > 0
      ? await loadFollowUpTasks(gctx, followUpContacts).catch((err) => {
          console.warn("[ads/tracker] task lookup failed", err);
          return new Map<string, WhenTask>();
        })
      : new Map<string, WhenTask>();

  const leadRows = baseRows.map((row) => {
    let when: LeadWhen | null = null;
    if (manual) {
      const picked = pickAppointment(appointmentsByContact.get(row.contactId) ?? [], now);
      if (picked) when = { at: picked.startTime, kind: "appointment", label: picked.title };
    } else if (needsAppointmentWhen(row.status as ClientLeadStatus)) {
      const picked = pickAppointment(appointmentsByContact.get(row.contactId) ?? [], now);
      if (picked) when = { at: picked.startTime, kind: "appointment", label: picked.title };
    } else if (isFollowUpStatus(row.status as ClientLeadStatus)) {
      const task = tasksByContact.get(row.contactId);
      if (task) when = { at: task.dueDate, kind: "follow_up", label: task.title };
    }
    return { ...row, when };
  });

  return {
    range,
    level,
    // Which vocabulary the status on each lead row speaks, and therefore
    // whether the page renders a badge or an editable dropdown.
    statusMode: (manual ? "manual" : "auto") as TrackerStatusMode,
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
