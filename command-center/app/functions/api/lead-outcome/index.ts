import type { Env } from "../../lib/env";
import { fetchContact } from "../../lib/ghl";
import { logErrorBestEffort } from "../../lib/errorLog";
import { dateStringInZone, zonedTimeToUtcMs } from "../../lib/tz";
import { createAppointment, getCalendar, rescheduleAppointment } from "../lib/appointments";
import { outcomeMessagePage, slotEnd } from "../../lib/estimateOutcome";
import { fetchContactAppointments, moveContactStage } from "../../lib/estimateOutcomeGhl";
import { formatWhen, resolveOutcomeLink, type OutcomeLink } from "../../lib/estimateOutcomeLink";
import {
  CALL_BACK_DAYS,
  CALL_BACK_TIMES,
  LEAD_KEY_PURPOSE,
  leadPage,
  parseLeadBody,
  stageForLead,
  upcomingEstimate,
} from "../../lib/leadOutcome";

// /api/lead-outcome?l=<locationId>&c=<contactId>&k=<key>  (public, own key)
//
// GET  the new-lead page (see lib/leadOutcome.ts).
// POST { outcome, slot? | date+time? | reason? } from that page. Books or
//      moves the estimate, saves a call-back or a reason, moves the card.

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function fail(error: string, status = 400): Response {
  return Response.json({ ok: false, error }, { status });
}

function contactName(c: { contactName?: string; firstName?: string; lastName?: string } | null): string {
  return (
    c?.contactName?.trim() ||
    [c?.firstName, c?.lastName].filter(Boolean).join(" ").trim() ||
    "New lead"
  );
}

interface Row {
  outcome: "estimate_booked" | "call_back" | "not_interested";
  reason: string | null;
  call_back_at: string | null;
}

async function loadRow(link: OutcomeLink): Promise<Row | null> {
  const { data } = await link.client
    .from("lead_link_outcomes")
    .select("outcome, reason, call_back_at")
    .eq("tenant_id", link.tenantId)
    .eq("ghl_contact_id", link.contactId)
    .maybeSingle();
  return (data as Row | null) ?? null;
}

function rowLabel(row: Row | null, zone: string): string {
  if (!row) return "";
  if (row.outcome === "call_back" && row.call_back_at) return `Call back ${formatWhen(row.call_back_at, zone)}`;
  if (row.outcome === "not_interested") return row.reason ?? "Not interested";
  return row.outcome === "estimate_booked" ? "Estimate booked" : "";
}

// The call-back days in the client's zone, and which of today's times are gone.
function callBackDays(zone: string, now: number) {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", month: "short", day: "numeric" });
  const days = Array.from({ length: CALL_BACK_DAYS }, (_, i) => {
    const at = now + i * 86_400_000;
    return { date: dateStringInZone(zone, at), label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : fmt.format(at) };
  });
  const pastToday = CALL_BACK_TIMES.filter((t) => {
    const ms = zonedTimeToUtcMs(zone, days[0].date, Number(t.slice(0, 2)), Number(t.slice(3, 5)));
    return ms === null || ms <= now;
  });
  return { days, pastToday };
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const link = await resolveOutcomeLink(ctx.env, new URL(ctx.request.url), LEAD_KEY_PURPOSE);
  if ("message" in link) return html(outcomeMessagePage(link.message), link.status);

  try {
    const now = Date.now();
    const [contact, appts, row] = await Promise.all([
      fetchContact(link.gctx, link.contactId),
      fetchContactAppointments(link.gctx, link.contactId).catch(() => []),
      loadRow(link),
    ]);
    if (!contact) return html(outcomeMessagePage("This lead is not in the account any more."), 404);
    const next = upcomingEstimate(appts, link.calendars.estimate.id, now);
    return html(
      leadPage({
        name: contactName(contact),
        current: rowLabel(row, link.zone),
        booked: next ? `Estimate ${formatWhen(next.startTime, link.zone)}` : "",
        query: link.query,
        ...callBackDays(link.zone, now),
      }),
    );
  } catch (err) {
    logErrorBestEffort(ctx.env, "lead-outcome", String(err), { contactId: link.contactId });
    return html(outcomeMessagePage("Something went wrong. Try again."), 502);
  }
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const link = await resolveOutcomeLink(ctx.env, new URL(ctx.request.url), LEAD_KEY_PURPOSE);
  if ("message" in link) return fail(link.message, link.status);

  let raw: unknown;
  try {
    raw = await ctx.request.json();
  } catch {
    return fail("Could not read that. Try again.");
  }
  const input = parseLeadBody(raw);
  if ("error" in input) return fail(input.error);

  const { client, gctx, tenantId, contactId, calendars, zone } = link;
  const now = Date.now();
  const row: Record<string, unknown> = {
    tenant_id: tenantId,
    ghl_contact_id: contactId,
    outcome: input.outcome,
    reason: null,
    appointment_id: null,
    call_back_at: null,
    reminded_at: null,
    updated_at: new Date(now).toISOString(),
  };
  let message = "Saved.";

  if (input.outcome === "estimate_booked") {
    const [contact, appts, detail] = await Promise.all([
      fetchContact(gctx, contactId),
      fetchContactAppointments(gctx, contactId).catch(() => []),
      getCalendar(gctx, calendars.estimate.id),
    ]);
    const end = slotEnd(input.slot, detail?.slotDuration, detail?.slotDurationUnit);
    const existing = upcomingEstimate(appts, calendars.estimate.id, now);
    if (existing) {
      const moved = await rescheduleAppointment(gctx, existing.id, input.slot, end);
      if (!moved.ok) return fail("That time is not free any more. Pick another.");
      row.appointment_id = existing.id;
    } else {
      const made = await createAppointment(gctx, {
        calendarId: calendars.estimate.id,
        contactId,
        startTime: input.slot,
        endTime: end,
        title: `Estimate: ${contactName(contact)}`,
      });
      if (!made.ok) {
        logErrorBestEffort(ctx.env, "lead-outcome", `estimate booking ${made.status}: ${made.body}`, { contactId });
        return fail(
          made.needsStaff ? "The estimate calendar has no team member on it." : "That time is not free any more. Pick another.",
        );
      }
      row.appointment_id = made.id || null;
    }
    message = `Saved. Estimate booked for ${formatWhen(input.slot, zone)}.`;
  } else if (input.outcome === "call_back") {
    const at = zonedTimeToUtcMs(zone, input.date, Number(input.time.slice(0, 2)), Number(input.time.slice(3, 5)));
    // A few minutes' grace for a page left open across the hour.
    if (at === null || at < now - 5 * 60_000) return fail("That time has passed. Pick another.");
    row.call_back_at = new Date(at).toISOString();
    message = `Saved. We'll text you ${formatWhen(row.call_back_at as string, zone)}.`;
  } else {
    row.reason = input.reason;
  }

  const { error } = await client
    .from("lead_link_outcomes")
    .upsert(row, { onConflict: "tenant_id,ghl_contact_id" });
  if (error) return fail("Could not save. Try again.", 500);

  const stage = stageForLead(input);
  const moved = await moveContactStage(gctx, contactId, stage.stage, { status: stage.status });
  if (moved !== "moved") {
    logErrorBestEffort(ctx.env, "lead-outcome", `stage: ${moved}`, { contactId, outcome: input.outcome });
  }
  return Response.json({ ok: true, message });
};
