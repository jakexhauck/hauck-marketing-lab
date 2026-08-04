// POST /api/book
//
// Re-checks the slot against a fresh read of her calendar, then writes the
// appointment and invites the client, which is what sends the confirmation.
//
// Price and length are resolved from service ids here. Whatever the page sends
// for cost or duration is ignored, so a tampered request cannot book a three
// hour bleach at the price of a blowout.

import { BOOKING_HORIZON_DAYS, TIMEZONE } from "../lib/config.ts";
import { type Interval, isStillFree } from "../lib/availability.ts";
import { addDays, dateInZone } from "../lib/time.ts";
import { findService, quote, resolveAddons } from "../lib/services.ts";
import type { Env } from "../lib/composio.ts";
import { type BookingInput, connectedAccountId, createBooking, getBusy } from "../lib/calendar.ts";
import { cleanText, digitsOnly, fail, json, looksLikeEmail } from "../lib/http.ts";
import { type TurnstileEnv, verifyTurnstile } from "../lib/turnstile.ts";

export async function onRequestPost(context: {
  request: Request;
  env: Env & TurnstileEnv;
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

  const service = findService(payload.service);
  if (!service) return fail("Unknown service", 400);

  const addons = resolveAddons(service, payload.addons);
  const { price, minutes, approx } = quote(service, addons);

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
  if (dateInZone(startMs, TIMEZONE) > addDays(dateInZone(Date.now(), TIMEZONE), BOOKING_HORIZON_DAYS)) {
    return fail("That is too far ahead to book", 400);
  }

  const accountId = await connectedAccountId(env);
  if (!accountId) return fail("Calendar is not connected yet", 503);

  // The slot may have gone in the seconds since the page listed it.
  const from = new Date(startMs - 24 * 3600_000).toISOString();
  const to = new Date(startMs + 48 * 3600_000).toISOString();
  let busy: Interval[];
  try {
    busy = await getBusy(env, accountId, from, to);
  } catch {
    return fail("Could not read the calendar just now", 503);
  }

  if (!isStillFree(startIso, minutes, busy, Date.now())) {
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
