import type { Env } from "../../lib/env";
import { fetchContact, type GhlContext } from "../../lib/ghl";
import { logErrorBestEffort } from "../../lib/errorLog";
import { dateStringInZone, zonedTimeToUtcMs } from "../../lib/tz";
import { cancelAppointment, createAppointment, getCalendar, getFreeSlots, rescheduleAppointment } from "./appointments";
import { outcomeMessagePage, slotDate, slotEnd } from "../../lib/estimateOutcome";
import { fetchContactAppointments, reportSaleToMeta } from "../../lib/estimateOutcomeGhl";
import { formatWhen, resolveOutcomeLink, type OutcomeLink } from "../../lib/estimateOutcomeLink";
import { upcomingEstimate } from "../../lib/leadOutcome";
import {
  CALL_BACK_DAYS,
  CALL_BACK_TIMES,
  STAGE_LABEL,
  lostReasonFor,
  outcomePage,
  parseOutcomeBody,
  stageKeyFor,
  type FormAnswers,
  type Outcome,
} from "../../lib/outcome";
import { moveLeadByContact } from "../../lib/outcomeMove";
import { answersFromContact, formFieldIds, saveAnswers } from "../../lib/outcomeFields";

// GET / POST / slots for the universal outcome page (lib/outcome.ts), shared by
// every route that opens it: /api/outcome (Outcome Link) and the older
// /api/lead-outcome and /api/estimate-outcome, each with its own key purpose
// so links already pasted into GHL keep working.

const DAYS_AHEAD = 21;
const BY = "owner link";

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
function fail(error: string, status = 400): Response {
  return Response.json({ ok: false, error }, { status });
}

interface Row {
  outcome: Outcome;
  reason: string | null;
  call_back_at: string | null;
  amount_cents: number | null;
  job_appointment_id: string | null;
  customer_job_id: string | null;
  attempts: number | null;
}

async function loadRow(link: OutcomeLink): Promise<Row | null> {
  const { data } = await link.client
    .from("lead_link_outcomes")
    .select("outcome, reason, call_back_at, amount_cents, job_appointment_id, customer_job_id, attempts")
    .eq("tenant_id", link.tenantId)
    .eq("ghl_contact_id", link.contactId)
    .maybeSingle();
  return (data as Row | null) ?? null;
}

function contactName(c: { contactName?: string; firstName?: string; lastName?: string } | null): string {
  return c?.contactName?.trim() || [c?.firstName, c?.lastName].filter(Boolean).join(" ").trim() || "Lead";
}

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function rowLabel(row: Row | null, zone: string): string {
  if (!row) return "";
  switch (row.outcome) {
    case "estimate_booked":
      return "Estimate booked";
    case "job_closed":
      return row.amount_cents ? `Job closed ${money(row.amount_cents)}` : "Job closed";
    case "call_back":
      return row.call_back_at ? `Call back ${formatWhen(row.call_back_at, zone)}` : "Call back";
    case "no_answer":
      return row.attempts ? `No answer (${row.attempts})` : "No answer";
    case "not_interested":
      return row.reason ?? "Not interested";
  }
}

// Call-back days in the client's zone, and which of today's times are gone.
export function callBackDays(zone: string, now: number) {
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

// No answer comes back round this time tomorrow, to the nearest 5 minutes.
export function noAnswerDue(now: number): number {
  const five = 5 * 60_000;
  return Math.round((now + 86_400_000) / five) * five;
}

function clock(ms: number, zone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(ms);
}

export function outcomeHandlers(purpose: string) {
  const onRequestGet: PagesFunction<Env> = async (ctx) => {
    const url = new URL(ctx.request.url);
    const link = await resolveOutcomeLink(ctx.env, url, purpose);
    if ("message" in link) return html(outcomeMessagePage(link.message), link.status);
    try {
      const now = Date.now();
      const [contact, appts, row, ids] = await Promise.all([
        fetchContact(link.gctx, link.contactId),
        fetchContactAppointments(link.gctx, link.contactId).catch(() => []),
        loadRow(link),
        formFieldIds(link.gctx).catch(() => new Map<string, string>()),
      ]);
      if (!contact) return html(outcomeMessagePage("This lead is not in the account any more."), 404);
      const next = upcomingEstimate(appts, link.calendars.estimate.id, now);
      return html(
        outcomePage({
          name: contactName(contact),
          booked: next ? `Estimate ${formatWhen(next.startTime, link.zone)}` : "",
          current: rowLabel(row, link.zone),
          base: url.pathname.replace(/\/$/, ""),
          query: link.query,
          hasJobCalendar: link.calendars.job !== null,
          form: answersFromContact(contact as never, ids),
          ...callBackDays(link.zone, now),
          noAnswerAt: clock(noAnswerDue(now), link.zone),
        }),
      );
    } catch (err) {
      logErrorBestEffort(ctx.env, "outcome", String(err), { contactId: link.contactId });
      return html(outcomeMessagePage("Something went wrong. Try again."), 502);
    }
  };

  const onRequestPost: PagesFunction<Env> = async (ctx) => {
    const link = await resolveOutcomeLink(ctx.env, new URL(ctx.request.url), purpose);
    if ("message" in link) return fail(link.message, link.status);
    let raw: unknown;
    try {
      raw = await ctx.request.json();
    } catch {
      return fail("Could not read that. Try again.");
    }
    const input = parseOutcomeBody(raw);
    if ("error" in input) return fail(input.error);

    const { client, gctx, tenantId, contactId, calendars, zone } = link;
    const now = Date.now();
    const [contact, prev] = await Promise.all([fetchContact(gctx, contactId), loadRow(link)]);
    if (!contact) return fail("This lead is not in the account any more.", 404);
    const name = contactName(contact);

    let jobAppointmentId = prev?.outcome === "job_closed" ? prev.job_appointment_id : null;
    let customerJobId = prev?.customer_job_id ?? null;
    let appointmentId: string | null = null;
    let callBackAt: string | null = null;
    let attempts = prev?.attempts ?? 0;
    let detail = "";

    // 1. The calendar first: if the time is taken, nothing else happens.
    if (input.outcome === "estimate_booked" || input.outcome === "job_closed") {
      const cal = input.outcome === "estimate_booked" ? calendars.estimate : calendars.job;
      if (!cal) return fail("No Job calendar in this account.");
      const meta = await getCalendar(gctx, cal.id);
      const end = slotEnd(input.slot, meta?.slotDuration, meta?.slotDurationUnit);
      const existing =
        input.outcome === "estimate_booked"
          ? (upcomingEstimate(await fetchContactAppointments(gctx, contactId).catch(() => []), cal.id, now)?.id ?? null)
          : jobAppointmentId;
      if (existing) {
        const moved = await rescheduleAppointment(gctx, existing, input.slot, end);
        if (!moved.ok) return fail("That time is not free any more. Pick another.");
        appointmentId = existing;
      } else {
        const made = await createAppointment(gctx, {
          calendarId: cal.id,
          contactId,
          startTime: input.slot,
          endTime: end,
          title: `${input.outcome === "estimate_booked" ? "Estimate" : "Job"}: ${name}`,
        });
        if (!made.ok) {
          logErrorBestEffort(ctx.env, "outcome", `booking ${made.status}: ${made.body}`, { contactId });
          return fail(made.needsStaff ? "That calendar has no team member on it." : "That time is not free any more. Pick another.");
        }
        appointmentId = made.id || null;
      }
      if (input.outcome === "job_closed") jobAppointmentId = appointmentId;
      await saveAnswers(gctx, contactId, input.form, await formFieldIds(gctx)).catch((err) =>
        logErrorBestEffort(ctx.env, "outcome", `form fields: ${String(err).slice(0, 200)}`, { contactId }),
      );
      detail = ` ${input.outcome === "job_closed" ? `${money(input.amountCents)} on` : "for"} ${formatWhen(input.slot, zone)}.`;
    }

    // A change of mind away from Job closed takes the sale back out.
    if (input.outcome !== "job_closed" && prev?.outcome === "job_closed") {
      if (customerJobId) await client.from("customer_jobs").delete().eq("id", customerJobId);
      if (jobAppointmentId) await cancelAppointment(gctx, jobAppointmentId);
      customerJobId = null;
      jobAppointmentId = null;
    }

    if (input.outcome === "call_back") {
      const at = zonedTimeToUtcMs(zone, input.date, Number(input.time.slice(0, 2)), Number(input.time.slice(3, 5)));
      if (at === null || at < now - 5 * 60_000) return fail("That time has passed. Pick another.");
      callBackAt = new Date(at).toISOString();
      detail = ` We'll text you ${formatWhen(callBackAt, zone)}.`;
    }
    if (input.outcome === "no_answer") {
      const due = noAnswerDue(now);
      callBackAt = new Date(due).toISOString();
      attempts += 1;
      detail = ` We'll text you tomorrow at ${clock(due, zone)} to call again.`;
    }
    if (input.outcome === "not_interested") detail = ` ${input.reason}.`;

    // 2. The lead moves the way the board moves it.
    const move = await moveLeadByContact({
      client,
      gctx,
      tenantId,
      contactId,
      contactName: name,
      zone,
      key: stageKeyFor(input.outcome),
      input:
        input.outcome === "estimate_booked" || input.outcome === "job_closed"
          ? { at: input.slot }
          : input.outcome === "call_back"
            ? { at: callBackAt as string, note: "Call back" }
            : input.outcome === "no_answer"
              ? { at: callBackAt as string, note: `No answer (${attempts})` }
              : { lostReason: lostReasonFor(input.reason) },
      monetaryValue: input.outcome === "job_closed" ? input.amountCents / 100 : undefined,
      by: BY,
    });
    if (!move.moved) logErrorBestEffort(ctx.env, "outcome", `stage: ${move.why}`, { contactId, outcome: input.outcome });

    // 3. Job closed counts as a job: one customer_jobs row, tied to the card so
    //    marking it Won on the board later corrects it rather than adding one.
    if (input.outcome === "job_closed") {
      const job = { value_cents: input.amountCents, completed_on: slotDate(input.slot), updated_at: new Date(now).toISOString() };
      if (customerJobId) {
        await client.from("customer_jobs").update(job).eq("id", customerJobId);
      } else {
        const { data } = await client
          .from("customer_jobs")
          .insert({
            ...job,
            tenant_id: tenantId,
            ghl_contact_id: contactId,
            description: "Job closed",
            created_by: "outcome_link",
            entered_from: "outcome_link",
            source_opportunity_id: move.moved ? move.opportunityId : null,
          })
          .select("id")
          .single();
        customerJobId = (data as { id?: string } | null)?.id ?? null;
      }
    }

    const { error } = await client.from("lead_link_outcomes").upsert(
      {
        tenant_id: tenantId,
        ghl_contact_id: contactId,
        outcome: input.outcome,
        reason: input.outcome === "not_interested" ? input.reason : null,
        appointment_id: input.outcome === "estimate_booked" ? appointmentId : null,
        call_back_at: callBackAt,
        reminded_at: null,
        amount_cents: input.outcome === "job_closed" ? input.amountCents : null,
        job_appointment_id: jobAppointmentId,
        customer_job_id: customerJobId,
        attempts,
        updated_at: new Date(now).toISOString(),
      },
      { onConflict: "tenant_id,ghl_contact_id" },
    );
    if (error) return fail("Could not save. Try again.", 500);

    if (input.outcome === "job_closed" && jobAppointmentId) {
      const meta = await reportSaleToMeta(client, tenantId, jobAppointmentId, input.amountCents, {
        email: contact.email,
        phone: contact.phone,
        firstName: contact.firstName,
        lastName: contact.lastName,
      }).catch((err) => `meta threw: ${String(err).slice(0, 120)}`);
      if (meta !== "sent" && meta !== "already sent" && meta !== "no dataset") {
        logErrorBestEffort(ctx.env, "outcome", `meta: ${meta}`, { contactId });
      }
    }

    const message = move.moved
      ? `Saved. Moved to ${move.stageName}.${detail}`
      : `Saved, but the lead did not move to ${STAGE_LABEL[input.outcome]}. We've flagged it.`;
    return Response.json({ ok: true, message, moved: move.moved });
  };

  const onSlotsGet: PagesFunction<Env> = async (ctx) => {
    const url = new URL(ctx.request.url);
    const link = await resolveOutcomeLink(ctx.env, url, purpose);
    if ("message" in link) return Response.json({ error: link.message }, { status: link.status });
    const which = url.searchParams.get("cal");
    const calendar = which === "job" ? link.calendars.job : link.calendars.estimate;
    if (!calendar) return Response.json({ days: [] });
    const now = Date.now();
    const result = await getFreeSlots(link.gctx as GhlContext, calendar.id, now, now + DAYS_AHEAD * 86_400_000, link.zone);
    if (!result.ok) return Response.json({ days: [], error: "Could not load times." }, { status: 502 });
    return Response.json({ days: result.days }, { headers: { "cache-control": "no-store" } });
  };

  return { onRequestGet, onRequestPost, onSlotsGet };
}

// Sample answers for the admin preview.
export const PREVIEW_FORM: FormAnswers = { address: "1428 Elm St, Allen Park, MI", services: "", notes: "" };
