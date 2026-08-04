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

// GoHighLevel wants a first and last name, not one field, and it splits a
// single `name` itself if you let it. Splitting here means the workflow maps
// two fields instead of guessing, and it is the same split every time.
//
// A one word name leaves the last name empty, which GoHighLevel accepts. This
// is a person filling in a booking form, so the surname is whatever follows
// the first space, double barrelled or not.
export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

// GoHighLevel needs E.164 to text anybody. Only the shapes we can be sure
// about are converted; anything else is handed over untouched rather than
// given a country code it may not have.
export function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (raw.trim().startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits;
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

  const who = splitName(input.name);

  return {
    // Who. first_name and last_name map straight onto a contact; phone_e164 is
    // the one to map, because the raw one is however the client typed it.
    name: input.name,
    first_name: who.first,
    last_name: who.last,
    phone: input.phone,
    phone_e164: toE164(input.phone),
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
    // For a line in a text that has a label in front of it. `addons` is left
    // empty when there are none, because an SMS reading "Add-On:" with nothing
    // after it looks broken, while a custom field holding the word "None"
    // would be worse.
    addons_display: addons || "None",
    has_addons: input.addons.length ? "yes" : "no",
    // Both together, for a one line summary: "Friday 2 October at 6:00 pm".
    start_when: `${day} at ${time}`,
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
