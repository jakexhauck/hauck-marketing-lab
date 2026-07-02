import type { Env, ApiData } from "../../../lib/env";
import {
  ghlJson,
  fetchAllOpportunities,
  type GhlContext,
  type GhlOpportunity,
} from "../../../lib/ghl";

// GET /api/sales/jobs: opportunities in the Sales Pipeline at the two job
// stages (Job Booked + Job Completed), each joined to its GHL appointment for
// the scheduled date/time. Shaped to the `Job` type the Jobs calendar reads
// (src/lib/jobsPipeline.ts), so the frontend needs no shape changes.
//
// IDs differ per tenant, so the pipeline and both stages are resolved by name
// (exact then contains) with the known Willis ids as a last-resort fallback.
// This is a read-only surface: stage writes (complete/reschedule/payment) are
// follow-up work.

// Fallback pipeline id (Willis Windows) if name resolution finds nothing. Every
// client is provisioned from the same template, but the id is per-tenant, so
// this is only a safety net behind the by-name lookup.
const SALES_PIPELINE_NAME = "sales pipeline";
const SALES_PIPELINE_FALLBACK_ID = "6o9Gx6e0TXRFJdln5d01";
const JOB_BOOKED_NAME = "job booked";
const JOB_COMPLETED_NAME = "job completed";

interface PipelinesResponse {
  pipelines: {
    id: string;
    name: string;
    stages: { id: string; name: string }[];
  }[];
}

// Job stage resolution result: the pipeline id plus the two stage ids we cover.
interface ResolvedStages {
  pipelineId: string;
  bookedStageId: string | null;
  completedStageId: string | null;
}

// A GHL calendar + the events read off it (mirrors functions/api/calendar/events.ts).
interface GhlCalendar {
  id: string;
  name?: string;
  timezone?: string;
}
interface CalendarsResp {
  calendars?: GhlCalendar[];
}
interface GhlEvent {
  id?: string;
  _id?: string;
  title?: string;
  startTime?: string;
  contactId?: string;
  address?: string;
  meetingLocation?: string;
}
interface EventsResp {
  events?: GhlEvent[];
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

// Resolve the Sales pipeline + Job Booked / Job Completed stages by name, exact
// first then a looser contains, so small renames still resolve. Falls back to
// the known Willis pipeline id if no pipeline matches by name at all.
function resolveStages(pipes: PipelinesResponse["pipelines"]): ResolvedStages {
  const pipe =
    pipes.find((p) => norm(p.name) === SALES_PIPELINE_NAME) ??
    pipes.find((p) => norm(p.name).includes("sales"));

  const stages = pipe?.stages ?? [];
  const booked =
    stages.find((s) => norm(s.name) === JOB_BOOKED_NAME) ??
    stages.find((s) => norm(s.name).includes("job booked"));
  const completed =
    stages.find((s) => norm(s.name) === JOB_COMPLETED_NAME) ??
    stages.find((s) => norm(s.name).includes("job completed"));

  return {
    pipelineId: pipe?.id ?? SALES_PIPELINE_FALLBACK_ID,
    bookedStageId: booked?.id ?? null,
    completedStageId: completed?.id ?? null,
  };
}

// Discover the location's calendars (id + timezone), same as the calendar feed.
async function discoverCalendars(gctx: GhlContext): Promise<GhlCalendar[]> {
  const data = await ghlJson<CalendarsResp>(
    gctx,
    `/calendars/?locationId=${encodeURIComponent(gctx.locationId)}`,
  );
  return data.calendars ?? [];
}

// Build a contactId -> appointment map across a wide window so both past
// (completed) and upcoming (booked) jobs find their appointment. When a contact
// has more than one appointment, keep the latest by startTime (the current job).
async function appointmentsByContact(
  gctx: GhlContext,
  calendars: GhlCalendar[],
): Promise<Map<string, GhlEvent>> {
  const map = new Map<string, GhlEvent>();
  if (calendars.length === 0) return map;

  const now = Date.now();
  const fromMs = now - 365 * 24 * 60 * 60_000; // a year back covers completed work
  const toMs = now + 180 * 24 * 60 * 60_000; // six months out covers booked work

  for (const cal of calendars) {
    try {
      const data = await ghlJson<EventsResp>(
        gctx,
        `/calendars/events?locationId=${encodeURIComponent(gctx.locationId)}&calendarId=${encodeURIComponent(cal.id)}&startTime=${fromMs}&endTime=${toMs}`,
      );
      for (const ev of data.events ?? []) {
        const cid = ev.contactId;
        if (!cid) continue;
        const prev = map.get(cid);
        if (!prev || (ev.startTime ?? "") > (prev.startTime ?? "")) {
          map.set(cid, ev);
        }
      }
    } catch (e) {
      console.warn(`[sales.jobs] calendar ${cal.id}`, e);
    }
  }
  return map;
}

// The Job shape the frontend reads (mirror of src/lib/jobsPipeline.ts `Job`).
interface ApiJob {
  id: string;
  // The opportunity's contact id, so job actions (Message, Ask for review) have
  // a real target. Empty when the opportunity has no contact.
  contactId: string;
  // The joined GHL appointment id, so Reschedule can PUT the right event.
  // Empty when no appointment is joined (date/time then came off the opportunity).
  appointmentId: string;
  customer: string;
  service: string;
  city: string;
  zip: string;
  phone: string;
  date: string;
  time: string;
  startMinutes: number;
  amount: number;
  status: "booked" | "completed";
  paid: boolean;
}

// Pull the local calendar date + display time + minutes-past-midnight out of a
// GHL timestamp. GHL appointment startTime carries the location offset
// (e.g. "2026-07-03T09:00:00-04:00"), so the literal wall-clock in the string IS
// the intended local time; parse it directly to avoid timezone-conversion drift.
function partsFromIso(
  iso: string | undefined,
): { date: string; time: string; startMinutes: number } | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return null;
  const [, y, mo, da, hh, mm] = m;
  const h = Number(hh);
  const min = Number(mm);
  const startMinutes = h * 60 + min;
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return {
    date: `${y}-${mo}-${da}`,
    time: `${h12}:${mm} ${ampm}`,
    startMinutes,
  };
}

// Best-effort split of a GHL appointment address into city + zip. Addresses are
// free-form ("123 Main St, Warren, MI 48091"), so this reads the last 5-digit
// group as the zip and the second-to-last comma segment as the city. Anything it
// cannot parse stays blank rather than guessing.
function cityZipFromAddress(address: string | undefined): { city: string; zip: string } {
  if (!address) return { city: "", zip: "" };
  const zipMatch = /\b(\d{5})(?:-\d{4})?\b/.exec(address);
  const zip = zipMatch ? zipMatch[1] : "";
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  const city = parts.length >= 2 ? parts[parts.length - 2] : "";
  return { city, zip };
}

function contactName(o: GhlOpportunity): string {
  return (
    o.contact?.name ||
    [o.contact?.firstName, o.contact?.lastName].filter(Boolean).join(" ").trim() ||
    o.name ||
    "Unknown"
  );
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };

  const pipeData = await ghlJson<PipelinesResponse>(
    gctx,
    `/opportunities/pipelines?locationId=${encodeURIComponent(t.ghl_location_id)}`,
  );
  const resolved = resolveStages(pipeData.pipelines ?? []);
  if (!resolved.bookedStageId && !resolved.completedStageId) {
    return Response.json({ jobs: [], configError: "stage_not_found" });
  }

  const [opps, calendars] = await Promise.all([
    fetchAllOpportunities(gctx, { pipelineId: resolved.pipelineId }),
    discoverCalendars(gctx),
  ]);

  const appts = await appointmentsByContact(gctx, calendars);

  const jobs: ApiJob[] = [];
  for (const o of opps) {
    const stageId = o.pipelineStageId ?? "";
    const status: "booked" | "completed" | null =
      stageId === resolved.bookedStageId
        ? "booked"
        : stageId === resolved.completedStageId
          ? "completed"
          : null;
    if (!status) continue;

    const contactId = o.contact?.id ?? o.contactId ?? "";
    const appt = contactId ? appts.get(contactId) : undefined;

    // Date/time come from the appointment when one is joined; otherwise fall
    // back to the opportunity's own timestamp so the job still lands on the
    // calendar rather than disappearing.
    const parts =
      partsFromIso(appt?.startTime) ??
      partsFromIso(o.lastStatusChangeAt ?? o.updatedAt ?? o.createdAt);
    if (!parts) continue;

    const { city, zip } = cityZipFromAddress(appt?.address ?? appt?.meetingLocation);
    const customer = contactName(o);
    const apptTitle = (appt?.title ?? "").trim();
    const service =
      apptTitle && norm(apptTitle) !== norm(customer)
        ? apptTitle
        : o.name && norm(o.name) !== norm(customer)
          ? o.name
          : "";

    jobs.push({
      id: o.id,
      contactId,
      appointmentId: appt?.id ?? appt?._id ?? "",
      customer,
      service,
      city,
      zip,
      phone: o.contact?.phone ?? "",
      date: parts.date,
      time: parts.time,
      startMinutes: parts.startMinutes,
      amount: typeof o.monetaryValue === "number" ? Math.round(o.monetaryValue) : 0,
      status,
      // Payment state has no clean GHL source yet (invoices/payments join is
      // out of scope), so completed jobs surface as unpaid until that lands.
      paid: false,
    });
  }

  return Response.json({ jobs });
};
