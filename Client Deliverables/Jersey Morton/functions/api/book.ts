// POST /api/book
//
// Re-checks the slot against a fresh read of her calendar, then writes the
// appointment and invites the client, which is what sends the confirmation.
//
// Price and length are resolved from service ids here. Whatever the page sends
// for cost or duration is ignored, so a tampered request cannot book a three
// hour bleach at the price of a blowout.

import { TIMEZONE } from "../lib/config.ts";
import { type Interval, isStillFree } from "../lib/availability.ts";
import { addDays, dateInZone } from "../lib/time.ts";
import { findServiceIn, quoteIn, resolveAddonsIn } from "../lib/settings.ts";
import { loadSchedule } from "../lib/schedule.ts";
import type { Env } from "../lib/composio.ts";
import { type BookingInput, connectedAccountId, createBooking, getBusy } from "../lib/calendar.ts";
import { cleanText, digitsOnly, fail, json, looksLikeEmail } from "../lib/http.ts";
import { type TurnstileEnv, verifyTurnstile } from "../lib/turnstile.ts";
import { type NotifyEnv, sendBookingNotice } from "../lib/notify.ts";

export async function onRequestPost(context: {
  request: Request;
  env: Env & TurnstileEnv & NotifyEnv;
  // Pages gives us this to keep work alive after the response has been sent.
  waitUntil?: (promise: Promise<unknown>) => void;
}): Promise<Response> {
  const env = context.env;

  let payload: Record<string, unknown>;
  try {
    payload = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return fail("Bad request body", 400);
  }

  // First gate, before any read or write. An abusive request costs one call to
  // Cloudflare and never reaches Composio, Google, or her calendar.
  const human = await verifyTurnstile(
    env,
    payload.turnstileToken,
    context.request.headers.get("CF-Connecting-IP"),
  );
  if (!human) return fail("Please complete the check below and try again.", 403);

  const name = cleanText(payload.name, 80);
  const email = cleanText(payload.email, 254);
  const phone = cleanText(payload.phone, 32);
  const notes = cleanText(payload.notes, 500);

  if (name.length < 2) return fail("Please give your name", 400);
  if (!looksLikeEmail(email)) return fail("That email does not look right", 400);
  if (digitsOnly(phone).length < 7) return fail("That phone number does not look right", 400);

  const startIso = cleanText(payload.startIso, 40);
  const startMs = Date.parse(startIso);
  if (Number.isNaN(startMs)) return fail("Pick a time", 400);

  const accountId = await connectedAccountId(env);
  if (!accountId) return fail("Calendar is not connected yet", 503);

  // The slot may have gone in the seconds since the page listed it, so both
  // reads are fresh. The schedule is re-read too rather than trusted from the
  // availability call: she may have closed the day in between.
  const from = new Date(startMs - 24 * 3600_000).toISOString();
  const to = new Date(startMs + 48 * 3600_000).toISOString();
  let busy: Interval[];
  let schedule;
  try {
    [busy, schedule] = await Promise.all([
      getBusy(env, accountId, from, to),
      loadSchedule(env, accountId, from, to),
    ]);
  } catch {
    return fail("Could not read the calendar just now", 503);
  }

  const settings = schedule.settings;
  const service = findServiceIn(settings, payload.service);
  if (!service) return fail("Unknown service", 400);

  const addons = resolveAddonsIn(settings, service, payload.addons);
  const { price, minutes, approx } = quoteIn(service, addons);

  if (dateInZone(startMs, TIMEZONE) > addDays(dateInZone(Date.now(), TIMEZONE), settings.horizonDays)) {
    return fail("That is too far ahead to book", 400);
  }

  if (
    !isStillFree(startIso, minutes, busy, Date.now(), TIMEZONE, {
      windows: schedule.windows,
      bufferMinutes: settings.bufferMinutes,
      minNoticeHours: settings.minNoticeHours,
      stepMinutes: settings.slotStepMinutes,
    })
  ) {
    return fail("That time has just gone. Please pick another.", 409);
  }

  const reference = crypto.randomUUID();
  const input: BookingInput = {
    reference,
    serviceName: service.name,
    addonNames: addons.map((a) => a.name),
    estimate: price,
    estimateIsApprox: approx,
    minutes,
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(startMs + minutes * 60_000).toISOString(),
    client: { name, email, phone },
    notes,
  };

  try {
    const event = await createBooking(env, accountId, input);

    // Tell Jersey, after the client has their answer rather than before it.
    // The appointment is already in her calendar and the invite has already
    // gone, so nothing here is allowed to fail the booking: waitUntil keeps it
    // alive past the response, and sendBookingNotice swallows its own errors.
    const notice = sendBookingNotice(env, {
      name,
      email,
      phone,
      service: service.name,
      addons: addons.map((a) => a.name),
      estimate: price,
      estimateIsApprox: approx,
      minutes,
      startIso: input.startIso,
      notes,
      reference,
      eventId: event.id,
    });
    if (context.waitUntil) context.waitUntil(notice);

    return json(
      {
        ok: true,
        reference,
        startIso: input.startIso,
        endIso: input.endIso,
        minutes,
        estimate: price,
        estimateIsApprox: approx,
        eventId: event.id,
      },
      201,
    );
  } catch {
    return fail("The booking did not go through. Please try again.", 502);
  }
}
