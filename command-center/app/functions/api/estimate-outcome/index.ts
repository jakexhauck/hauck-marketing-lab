import type { Env } from "../../lib/env";
import { fetchContact } from "../../lib/ghl";
import { logErrorBestEffort } from "../../lib/errorLog";
import {
  cancelAppointment,
  createAppointment,
  getCalendar,
  rescheduleAppointment,
} from "../lib/appointments";
import {
  outcomeMessagePage,
  outcomePage,
  parseOutcomeBody,
  pickEstimateAppointment,
  slotDate,
  slotEnd,
  stageForOutcome,
  type Outcome,
} from "../../lib/estimateOutcome";
import { fetchContactAppointments, moveContactStage, reportSaleToMeta } from "../../lib/estimateOutcomeGhl";
import { formatWhen, resolveOutcomeLink, type OutcomeLink } from "../../lib/estimateOutcomeLink";

// /api/estimate-outcome?l=<locationId>&c=<contactId>&k=<key>[&a=<appointmentId>]
// (public, own key; see lib/estimateOutcome.ts)
//
// GET  the page: what happened at this lead's estimate.
// POST { outcome, amount?, reason?, slot? } from that page. Saves the outcome,
//      books or moves the GoHighLevel appointment it implies, writes the job
//      the Ads Dashboard counts, moves the card, and tells Meta about a sale.

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

interface OutcomeRow {
  id: string;
  outcome: Outcome;
  amount_cents: number | null;
  reason: string | null;
  job_appointment_id: string | null;
  customer_job_id: string | null;
}

async function loadOutcome(link: OutcomeLink, appointmentId: string): Promise<OutcomeRow | null> {
  const { data } = await link.client
    .from("estimate_outcomes")
    .select("id, outcome, amount_cents, reason, job_appointment_id, customer_job_id")
    .eq("tenant_id", link.tenantId)
    .eq("ghl_appointment_id", appointmentId)
    .maybeSingle();
  return (data as OutcomeRow | null) ?? null;
}

async function findEstimate(link: OutcomeLink) {
  const appts = await fetchContactAppointments(link.gctx, link.contactId);
  return pickEstimateAppointment(appts, link.calendars.estimate.id, Date.now(), link.appointmentId);
}

function contactName(c: { contactName?: string; firstName?: string; lastName?: string } | null): string {
  return (
    c?.contactName?.trim() ||
    [c?.firstName, c?.lastName].filter(Boolean).join(" ").trim() ||
    "this lead"
  );
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const link = await resolveOutcomeLink(ctx.env, new URL(ctx.request.url));
  if ("message" in link) return html(outcomeMessagePage(link.message), link.status);

  try {
    const [estimate, contact] = await Promise.all([findEstimate(link), fetchContact(link.gctx, link.contactId)]);
    if (!estimate) return html(outcomeMessagePage("No estimate found for this lead."), 404);
    const current = await loadOutcome(link, estimate.id);
    return html(
      outcomePage({
        name: contactName(contact),
        when: formatWhen(estimate.startTime, link.zone),
        current: current
          ? { outcome: current.outcome, amountCents: current.amount_cents, reason: current.reason }
          : null,
        // The appointment is pinned from here on, so a second estimate booked
        // while the page is open cannot steal the answer.
        query: link.appointmentId ? link.query : `${link.query}&a=${encodeURIComponent(estimate.id)}`,
        hasJobCalendar: link.calendars.job !== null,
      }),
    );
  } catch (err) {
    logErrorBestEffort(ctx.env, "estimate-outcome", String(err), { contactId: link.contactId });
    return html(outcomeMessagePage("Something went wrong. Try again."), 502);
  }
};

function fail(error: string, status = 400): Response {
  return Response.json({ ok: false, error }, { status });
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const link = await resolveOutcomeLink(ctx.env, new URL(ctx.request.url));
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
  const [estimate, contact] = await Promise.all([
    findEstimate(link).catch(() => null),
    fetchContact(gctx, contactId),
  ]);
  if (!estimate) return fail("No estimate found for this lead.", 404);
  const existing = await loadOutcome(link, estimate.id);
  const name = contactName(contact);
  const now = new Date().toISOString();

  let jobAppointmentId: string | null = existing?.outcome === "sold" ? existing.job_appointment_id : null;
  let customerJobId: string | null = existing?.customer_job_id ?? null;
  let message = "Saved.";

  if (input.outcome === "sold") {
    const job = calendars.job;
    if (!job) return fail("No Job calendar in this account.");
    const slot = input.slot as string;
    const detail = await getCalendar(gctx, job.id);
    const end = slotEnd(slot, detail?.slotDuration, detail?.slotDurationUnit);

    // A second Sold on the same estimate moves the job it already booked
    // rather than booking a second one.
    if (jobAppointmentId) {
      const moved = await rescheduleAppointment(gctx, jobAppointmentId, slot, end);
      if (!moved.ok) return fail("That time is not free any more. Pick another.");
    } else {
      const made = await createAppointment(gctx, {
        calendarId: job.id,
        contactId,
        startTime: slot,
        endTime: end,
        title: `Job: ${name}`,
      });
      if (!made.ok) {
        logErrorBestEffort(ctx.env, "estimate-outcome", `job booking ${made.status}: ${made.body}`, { contactId });
        return fail(made.needsStaff ? "The Job calendar has no team member on it." : "That time is not free any more. Pick another.");
      }
      jobAppointmentId = made.id || null;
    }

    const job_row = {
      value_cents: input.amountCents as number,
      completed_on: slotDate(slot),
      updated_at: now,
    };
    if (customerJobId) {
      const { error } = await client.from("customer_jobs").update(job_row).eq("id", customerJobId);
      if (error) return fail("Could not save. Try again.", 500);
    } else {
      const { data, error } = await client
        .from("customer_jobs")
        .insert({
          ...job_row,
          tenant_id: tenantId,
          ghl_contact_id: contactId,
          description: "Sold at estimate",
          created_by: "estimate_outcome",
          entered_from: "estimate_outcome",
        })
        .select("id")
        .single();
      if (error || !data) return fail("Could not save. Try again.", 500);
      customerJobId = String((data as { id: string }).id);
    }
    message = `Saved. Job booked for ${formatWhen(slot, zone)}.`;
  } else {
    // Changing a Sold to anything else takes the sale back out: the job comes
    // off the calendar and the dollars off the dashboard.
    if (customerJobId) {
      await client.from("customer_jobs").delete().eq("id", customerJobId);
      customerJobId = null;
    }
    if (jobAppointmentId) {
      await cancelAppointment(gctx, jobAppointmentId);
      jobAppointmentId = null;
    }
    if (input.outcome === "rescheduled") {
      const slot = input.slot as string;
      const detail = await getCalendar(gctx, calendars.estimate.id);
      const moved = await rescheduleAppointment(
        gctx,
        estimate.id,
        slot,
        slotEnd(slot, detail?.slotDuration, detail?.slotDurationUnit),
      );
      if (!moved.ok) return fail("That time is not free any more. Pick another.");
      message = `Saved. Estimate moved to ${formatWhen(slot, zone)}.`;
    }
  }

  const { error: saveErr } = await client.from("estimate_outcomes").upsert(
    {
      tenant_id: tenantId,
      ghl_contact_id: contactId,
      ghl_appointment_id: estimate.id,
      outcome: input.outcome,
      amount_cents: input.amountCents,
      reason: input.reason,
      job_appointment_id: jobAppointmentId,
      customer_job_id: customerJobId,
      rebooked_at: input.outcome === "rescheduled" ? input.slot : null,
      updated_at: now,
    },
    { onConflict: "tenant_id,ghl_appointment_id" },
  );
  if (saveErr) return fail("Could not save. Try again.", 500);

  // Best effort from here: the outcome is saved.
  const stage = stageForOutcome(input.outcome);
  const moved = stage
    ? await moveContactStage(gctx, contactId, stage.stage, {
        status: stage.status,
        monetaryValue: input.amountCents !== null ? input.amountCents / 100 : undefined,
      })
    : "moved";
  if (moved !== "moved") {
    logErrorBestEffort(ctx.env, "estimate-outcome", `stage: ${moved}`, { contactId, outcome: input.outcome });
  }
  if (input.outcome === "sold") {
    const meta = await reportSaleToMeta(client, tenantId, estimate.id, input.amountCents as number, {
      email: contact?.email,
      phone: contact?.phone,
      firstName: contact?.firstName,
      lastName: contact?.lastName,
    }).catch((err) => `meta threw: ${String(err).slice(0, 120)}`);
    if (meta !== "sent" && meta !== "already sent" && meta !== "no dataset") {
      logErrorBestEffort(ctx.env, "estimate-outcome", `meta: ${meta}`, { contactId });
    }
  }

  return Response.json({ ok: true, message });
};
