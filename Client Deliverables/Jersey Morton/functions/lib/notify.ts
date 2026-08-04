// Tells Jersey a booking just happened.
//
// Posts a flat JSON payload to a GoHighLevel inbound webhook, which is what
// her SMS workflow triggers on. Flat and snake_case on purpose: nested fields
// are painful to reference as merge tags in a workflow.
//
// Two rules this file exists to keep:
//   1. It never breaks a booking. The appointment is already in her calendar
//      and the client already has their invite by the time this runs. A dead
//      webhook must not turn that into a 502 and a client who books twice.
//   2. It never blocks the confirmation. The caller hands it to waitUntil, so
//      the client sees "you are booked in" without waiting on GoHighLevel.

import { TIMEZONE } from "./config.ts";
import { minutesToLabel } from "./availability.ts";

export interface NotifyEnv {
  // The inbound webhook URL. A secret: anyone holding it can fire her
  // workflow, so it lives in the Pages environment, never in the repo.
  BOOKING_WEBHOOK_URL?: string;
}

export interface BookingNotice {
  name: string;
  email: string;
  phone: string;
  service: string;
  addons: string[];
  estimate: number;
  estimateIsApprox: boolean;
  minutes: number;
  startIso: string;
  notes?: string;
  reference: string;
  eventId?: string;
}

function parts(iso: string, tz: string): { day: string; time: string } {
  const at = new Date(iso);
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(at);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(at)
    .toLowerCase();
  return { day, time };
}

// Exported for tests. Everything the workflow could want, plus a ready made
// sentence so the SMS can be a single merge tag if that is all she needs.
export function buildBookingNotice(input: BookingNotice, tz = TIMEZONE): Record<string, string> {
  const { day, time } = parts(input.startIso, tz);
  const addons = input.addons.join(", ");
  const money = `$${input.estimate}${input.estimateIsApprox ? "+" : ""}`;
  const length = minutesToLabel(input.minutes);

  const message =
    `New booking: ${input.name}, ${day} at ${time}. ` +
    `${input.service}${addons ? ` plus ${addons}` : ""}. ` +
    `${length}, about ${money}. ` +
    `${input.phone}, ${input.email}.` +
    (input.notes ? ` Notes: ${input.notes}` : "");

  return {
    // Who
    name: input.name,
    phone: input.phone,
    email: input.email,
    // When, both readable and exact. The ISO is there so a workflow can do
    // date maths without re-parsing the pretty version.
    start_day: day,
    start_time: time,
    start_iso: input.startIso,
    timezone: tz,
    duration_minutes: String(input.minutes),
    duration_label: length,
    // What
    service: input.service,
    addons,
    has_addons: input.addons.length ? "yes" : "no",
    estimate: String(input.estimate),
    estimate_display: money,
    estimate_is_approx: input.estimateIsApprox ? "yes" : "no",
    notes: input.notes ?? "",
    // Bookkeeping
    reference: input.reference,
    event_id: input.eventId ?? "",
    message,
  };
}

export function notifyConfigured(env: NotifyEnv): boolean {
  return Boolean(env.BOOKING_WEBHOOK_URL);
}

// Swallows everything on purpose, and says so in the logs. A booking that
// happened is more important than a notification that did not.
export async function sendBookingNotice(env: NotifyEnv, input: BookingNotice): Promise<boolean> {
  if (!env.BOOKING_WEBHOOK_URL) return false;

  try {
    const res = await fetch(env.BOOKING_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBookingNotice(input)),
      // GoHighLevel being slow must not hold a Worker open indefinitely.
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`booking webhook ${res.status} for ${input.reference}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(
      `booking webhook failed for ${input.reference}:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
