import { GRAPH } from "./metaGraph";

// Server-side Meta Conversions API for the ads funnels.
//
// WHY THIS EXISTS AT ALL. GHL's own "Meta Conversion API" workflow action fails
// on these leads, and its execution log says the lead has no lead id. It cannot
// ever succeed: `lead_id` belongs to Meta INSTANT FORMS, and a hosted landing
// page never has one.
//
// The deeper cause is upstream of that action. Our funnels POST the lead to a
// GHL inbound webhook, which fires BEFORE GHL's own tracking script has ever
// seen the person, so GHL stamps the new contact:
//
//   attributionSource: { sessionSource: "CRM Workflows", medium: "Manual" }
//
// with no fbclid, no ad id and no click data of any kind. Verified on a live
// Willis lead. The real Meta set does reach GHL later, from the GHL-hosted
// booking step, but by then it lands in `lastAttributionSource` and the contact
// has already existed as "Manual" for a minute. There is simply nothing on the
// contact for GHL's action to match a person on.
//
// So the funnel reports its own conversion, straight to Meta, and GHL goes back
// to being the CRM. The browser cannot do this itself: hashing has to happen
// somewhere the raw email is not already public, and only the server sees the
// homeowner's real IP.
//
// WHAT MAKES THE MATCH. Meta scores a website Lead on `fbc` (built from the ad
// click), `fbp` (the browser), the hashed contact details, and the IP and user
// agent. The funnel supplies the first two, this module hashes the third, and
// Cloudflare supplies the last two.

// One funnel's conversion wiring. Kept in code beside the served funnel files
// rather than in a table, because a funnel IS a hand-written file per client:
// there is no screen that creates one, so there is nothing to configure.
export interface FunnelCapi {
  // The pixel the LIVE ad set optimises for. Read off the ad set's
  // promoted_object, never guessed from the pixel list: Willis's account
  // carries three pixels and two of them are dead.
  pixelId: string;
  // Origins allowed to report a conversion for this funnel. The funnel pages
  // are served inside the client's own domain, so this is the whole guard
  // against a stranger writing Leads into a client's pixel.
  origins: string[];
}

export const FUNNEL_CAPI: Record<string, FunnelCapi> = {
  // "Willis Windows Dataset". The one ACTIVE ad set on act_27110669075184924
  // carries promoted_object { pixel_id: 982737334630926, custom_event_type:
  // LEAD }, and its last_fired_time tracks real bookings. The other two pixels
  // on the account ("Hauck Marketing Pixel", "OLD") have never fired for Willis.
  willis: {
    pixelId: "982737334630926",
    origins: ["https://williswindows.com", "https://www.williswindows.com"],
  },
};

// Meta's Lead event. The ad set's custom_event_type is LEAD, so this string is
// not a preference: anything else is a conversion the campaign cannot optimise
// against and will not report.
export const LEAD_EVENT = "Lead";

// Meta's standard event for a booked appointment.
//
// "Schedule" is one of Meta's own standard event names, which matters: a custom
// event would be reportable but not selectable as an ad set's optimisation
// goal, and optimising for booked jobs rather than form fills is most of the
// point of sending it.
export const SCHEDULE_EVENT = "Schedule";

// Which funnel (and therefore which pixel) a tenant's bookings belong to.
//
// A funnel is a hand-written set of files, so there is no screen that creates
// one and nothing to configure: a client with no entry here simply reports no
// bookings, which is the honest outcome for a client whose ads do not run
// through one of our funnels.
//
// Keyed by tenant SLUG rather than id so it reads as something a human can
// check against the tenants table.
export const TENANT_FUNNEL: Record<string, string> = {
  "willis-windows": "willis",
};

export function funnelForTenantSlug(slug: string | null | undefined): FunnelCapi | null {
  const key = TENANT_FUNNEL[String(slug ?? "").trim()];
  return key ? (FUNNEL_CAPI[key] ?? null) : null;
}

export function funnelKeyForTenantSlug(slug: string | null | undefined): string | null {
  return TENANT_FUNNEL[String(slug ?? "").trim()] ?? null;
}

// ---------------------------------------------------------------- hashing

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Meta normalises before hashing and so must we, or the same person hashes to
// two different values and the match rate quietly halves. Every rule below is
// Meta's, not ours.

export function normEmail(value: string): string {
  return String(value ?? "").trim().toLowerCase();
}

// Digits only, carrying the country code. A ten-digit US number is prefixed
// with 1, because Meta matches on the full international form and "3134053227"
// and "13134053227" are two different people to it.
export function normPhone(value: string): string {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 10) digits = `1${digits}`;
  return digits;
}

// Names, cities: lowercase, and every character that is not a letter removed.
// Meta strips punctuation and whitespace, so "Mary-Anne" and "mary anne" have
// to arrive as the same string.
export function normName(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-zà-ÿ]/g, "");
}

// Two-letter, lowercase. A spelled-out "Michigan" is normalised to "mi" only
// when it is already two characters; anything longer is sent as-is lowercased
// rather than truncated, since truncating "Minnesota" to "mi" invents a match.
export function normState(value: string): string {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
}

// The first five digits. Meta ignores the +4 on a US zip, and sending it makes
// the hash disagree with everyone who did not.
export function normZip(value: string): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.slice(0, 5);
}

export interface LeadIdentity {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

// The unhashed pieces: these are IDs, not personal details, and Meta requires
// them in the clear.
export interface LeadSignals {
  fbc?: string;
  fbp?: string;
  ip?: string;
  userAgent?: string;
}

// Meta's user_data. Hashed fields go as arrays because a person can have more
// than one of several of them, and an array of one is always valid.
export async function buildUserData(
  who: LeadIdentity,
  signals: LeadSignals,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};

  const hashed: [string, string][] = [
    ["em", normEmail(who.email ?? "")],
    ["ph", normPhone(who.phone ?? "")],
    ["fn", normName(who.firstName ?? "")],
    ["ln", normName(who.lastName ?? "")],
    ["ct", normName(who.city ?? "")],
    ["st", normState(who.state ?? "")],
    ["zp", normZip(who.zip ?? "")],
    ["country", normState(who.country ?? "")],
  ];

  for (const [key, value] of hashed) {
    // An empty field is OMITTED, never sent as the hash of "". The hash of an
    // empty string is a real, constant hex string, and every lead missing that
    // field would match every other one on it.
    if (!value) continue;
    out[key] = [await sha256Hex(value)];
  }

  // Never hashed. Hashing these makes them unusable and Meta drops them.
  if (signals.fbc) out.fbc = signals.fbc;
  if (signals.fbp) out.fbp = signals.fbp;
  if (signals.ip) out.client_ip_address = signals.ip;
  if (signals.userAgent) out.client_user_agent = signals.userAgent;

  return out;
}

// ------------------------------------------------------------------ send

export interface LeadEventInput {
  eventId: string;
  // Seconds. Meta rejects milliseconds outright, and it rejects anything more
  // than seven days old, which is why the funnel stamps this and not a later job.
  eventTime: number;
  sourceUrl?: string;
  who: LeadIdentity;
  signals: LeadSignals;
  // Routes the event to Events Manager's Test Events tab instead of the live
  // stream. Used to prove the wiring without inventing a lead in a client's
  // reporting.
  testEventCode?: string;
}

export interface LeadEventResult {
  ok: boolean;
  status: number;
  eventsReceived?: number;
  fbtraceId?: string;
  error?: string;
  // Meta's own words for the failure. `error` alone is almost always the
  // useless "Invalid parameter": every distinct problem, from a stale
  // timestamp to a malformed hash, arrives under that one string. The subcode
  // and the user message are what actually name the fault, so they are kept.
  errorSubcode?: number;
  errorDetail?: string;
}

export async function sendLeadEvent(
  token: string,
  funnel: FunnelCapi,
  input: LeadEventInput,
): Promise<LeadEventResult> {
  return sendConversionEvent(token, funnel, LEAD_EVENT, input);
}

// A booked appointment, reported to the same pixel the Lead went to.
//
// `eventId` must be the GHL appointment id. Both paths that can report a
// booking (the AppointmentCreate webhook, and the polling sync for clients
// whose webhook is not wired) therefore send the same id, so firing both counts
// one booking rather than two.
//
// `actionSource` is "website" for a self-serve booking widget, which is what
// the funnel's booking step is. A booking the office typed in by hand should
// pass "system_generated" instead: claiming a website action for a phone call
// misrepresents where the conversion happened, and Meta weighs the two
// differently.
export async function sendScheduleEvent(
  token: string,
  funnel: FunnelCapi,
  input: LeadEventInput & { actionSource?: string },
): Promise<LeadEventResult> {
  return sendConversionEvent(token, funnel, SCHEDULE_EVENT, input);
}

export async function sendConversionEvent(
  token: string,
  funnel: FunnelCapi,
  eventName: string,
  input: LeadEventInput & { actionSource?: string },
): Promise<LeadEventResult> {
  const body: Record<string, unknown> = {
    access_token: token,
    data: [
      {
        event_name: eventName,
        event_time: input.eventTime,
        // The funnel's id for this submission. If a browser-side pixel Lead is
        // ever added it must reuse the same value, or Meta counts one lead
        // twice: once from the browser and once from here.
        event_id: input.eventId,
        event_source_url: input.sourceUrl || undefined,
        action_source: input.actionSource || "website",
        user_data: await buildUserData(input.who, input.signals),
      },
    ],
  };
  if (input.testEventCode) body.test_event_code = input.testEventCode;

  let res: Response;
  try {
    res = await fetch(`${GRAPH}/${funnel.pixelId}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error)?.message ?? "network error" };
  }

  const payload = (await res.json().catch(() => ({}))) as {
    events_received?: number;
    fbtrace_id?: string;
    error?: {
      message?: string;
      error_subcode?: number;
      error_user_title?: string;
      error_user_msg?: string;
      fbtrace_id?: string;
    };
  };

  if (!res.ok) {
    const err = payload.error ?? {};
    const detail = [err.error_user_title, err.error_user_msg].filter(Boolean).join(": ");
    return {
      ok: false,
      status: res.status,
      fbtraceId: payload.fbtrace_id ?? err.fbtrace_id,
      error: err.message ?? `HTTP ${res.status}`,
      errorSubcode: err.error_subcode,
      errorDetail: detail || undefined,
    };
  }

  return {
    ok: true,
    status: res.status,
    eventsReceived: payload.events_received,
    fbtraceId: payload.fbtrace_id,
  };
}

// The Origin guard. A request with NO Origin header is refused rather than
// waved through: every real caller here is a cross-origin beacon from the
// client's own domain, so a missing Origin means something else is calling.
export function originAllowedForFunnel(origin: string | null, funnel: FunnelCapi): boolean {
  if (!origin) return false;
  return funnel.origins.includes(origin);
}
