// The lead tracker's "when" column: the one date that matters for a lead,
// given its status.
//
// Two different sources, chosen by status:
//   booked statuses  -> the GHL calendar appointment (Phone Appt / Estimate /
//                       Job). Bulk-fetched per calendar, so it costs a handful
//                       of calls for the whole list.
//   chasing statuses -> the next open GHL task's due date. GHL has no bulk task
//                       search (POST /locations/{id}/tasks/search exists but
//                       returns nothing), so this is one call per contact and is
//                       therefore capped and only run for the chasing statuses.
//
// Everything here reads live from GHL rather than from a value the webhook
// captured once: tasks get rescheduled and appointments get moved by hand all
// day, and a stale date is worse than no date.

import { ghlJson, type GhlContext } from "./ghl";
import type { ClientLeadStatus } from "./leadStatus";

export interface WhenEvent {
  id: string;
  contactId: string;
  startTime: string;
  status: string;
  title: string;
}

export interface WhenTask {
  id: string;
  title: string;
  dueDate: string;
  completed: boolean;
}

// What the client reads in the column, and where it came from.
export type WhenKind = "appointment" | "follow_up";

export interface LeadWhen {
  at: string;
  kind: WhenKind;
  label: string;
}

// Statuses that mean an appointment exists. Handed Off is deliberately absent:
// the phone appointment that earned the hand-off is already over, and the owner
// has not booked anything yet, so there is no date worth showing.
const APPOINTMENT_STATUSES = new Set<ClientLeadStatus>([
  "phone_appt_booked",
  "phone_appt_confirmed",
  "estimate_booked",
  "job_booked",
]);

// Statuses that mean somebody owes this lead a call.
const FOLLOW_UP_STATUSES = new Set<ClientLeadStatus>([
  "phone_follow_up",
  "follow_up",
  "long_term_nurture",
]);

export function needsAppointmentWhen(status: ClientLeadStatus): boolean {
  return APPOINTMENT_STATUSES.has(status);
}

export function isFollowUpStatus(status: ClientLeadStatus): boolean {
  return FOLLOW_UP_STATUSES.has(status);
}

function ms(value: string): number {
  const t = Date.parse(value ?? "");
  return Number.isFinite(t) ? t : NaN;
}

// A cancelled appointment is not a date the client should be shown; the lead
// will have moved to a Cancelled Appointments stage anyway.
function isCancelled(status: string): boolean {
  return (status ?? "").trim().toLowerCase().startsWith("cancel");
}

// The soonest upcoming appointment, else the most recent past one. A Job Booked
// lead whose job already happened still deserves to show its date.
export function pickAppointment(events: WhenEvent[], now: number): WhenEvent | null {
  let upcoming: { ev: WhenEvent; at: number } | null = null;
  let past: { ev: WhenEvent; at: number } | null = null;

  for (const ev of events) {
    if (isCancelled(ev.status)) continue;
    const at = ms(ev.startTime);
    if (!Number.isFinite(at)) continue;
    if (at >= now) {
      if (!upcoming || at < upcoming.at) upcoming = { ev, at };
    } else if (!past || at > past.at) {
      past = { ev, at };
    }
  }
  return (upcoming ?? past)?.ev ?? null;
}

// The soonest-due open task. Overdue tasks are kept, not hidden: an overdue
// follow-up is the most important one on the page.
export function pickFollowUpTask(tasks: WhenTask[]): WhenTask | null {
  let best: { task: WhenTask; at: number } | null = null;
  for (const task of tasks) {
    if (task.completed) continue;
    const at = ms(task.dueDate);
    if (!Number.isFinite(at)) continue;
    if (!best || at < best.at) best = { task, at };
  }
  return best?.task ?? null;
}

// ---------------------------------------------------------------------------
// Live fetchers

interface CalendarsResp {
  calendars?: { id: string; name?: string }[];
}
interface EventsResp {
  events?: {
    id?: string;
    _id?: string;
    title?: string;
    startTime?: string;
    appointmentStatus?: string;
    status?: string;
    contactId?: string;
  }[];
}
interface TasksResp {
  tasks?: {
    id?: string;
    _id?: string;
    title?: string;
    dueDate?: string;
    completed?: boolean;
  }[];
}

// How far either side of today to look for appointments. Wide enough to catch a
// job booked months out and an estimate that already happened, without asking
// GHL for the client's entire history.
const WINDOW_DAYS = 180;

// Every appointment in the window, grouped by contact. One call per calendar
// (clients have two or three), not one per lead.
export async function loadAppointmentsByContact(
  gctx: GhlContext,
  now: number,
): Promise<Map<string, WhenEvent[]>> {
  const byContact = new Map<string, WhenEvent[]>();
  let calendars: CalendarsResp["calendars"] = [];
  try {
    const data = await ghlJson<CalendarsResp>(
      gctx,
      `/calendars/?locationId=${encodeURIComponent(gctx.locationId)}`,
    );
    calendars = data.calendars ?? [];
  } catch (err) {
    // No calendars means no appointment dates, not a broken tracker.
    console.warn("[leadWhen] calendar discovery failed", err);
    return byContact;
  }

  const from = now - WINDOW_DAYS * 86_400_000;
  const to = now + WINDOW_DAYS * 86_400_000;

  const perCalendar = await Promise.all(
    calendars.map(async (cal) => {
      try {
        const data = await ghlJson<EventsResp>(
          gctx,
          `/calendars/events?locationId=${encodeURIComponent(gctx.locationId)}&calendarId=${encodeURIComponent(cal.id)}&startTime=${from}&endTime=${to}`,
        );
        return (data.events ?? []).map((ev) => ({
          id: (ev.id ?? ev._id ?? "") as string,
          contactId: ev.contactId ?? "",
          startTime: ev.startTime ?? "",
          status: ev.appointmentStatus ?? ev.status ?? "booked",
          title: ev.title || cal.name || "Appointment",
        }));
      } catch (err) {
        console.warn(`[leadWhen] events failed for calendar ${cal.id}`, err);
        return [] as WhenEvent[];
      }
    }),
  );

  for (const events of perCalendar) {
    for (const ev of events) {
      if (!ev.contactId) continue;
      const list = byContact.get(ev.contactId);
      if (list) list.push(ev);
      else byContact.set(ev.contactId, [ev]);
    }
  }
  return byContact;
}

// GHL has no working bulk task search, so this is one call per contact. Only
// ever called for the chasing statuses, and capped so a big client cannot turn
// the tracker into a hundred round-trips.
const MAX_TASK_LOOKUPS = 60;
const TASK_CONCURRENCY = 6;

export async function loadFollowUpTasks(
  gctx: GhlContext,
  contactIds: string[],
): Promise<Map<string, WhenTask>> {
  const out = new Map<string, WhenTask>();
  const ids = contactIds.slice(0, MAX_TASK_LOOKUPS);
  if (ids.length < contactIds.length) {
    console.warn(
      `[leadWhen] task lookup capped at ${MAX_TASK_LOOKUPS} of ${contactIds.length} contacts`,
    );
  }

  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor++;
      if (i >= ids.length) return;
      const contactId = ids[i];
      try {
        const data = await ghlJson<TasksResp>(
          gctx,
          `/contacts/${encodeURIComponent(contactId)}/tasks`,
        );
        const tasks: WhenTask[] = (data.tasks ?? []).map((t) => ({
          id: (t.id ?? t._id ?? "") as string,
          title: t.title ?? "Follow up",
          dueDate: t.dueDate ?? "",
          completed: Boolean(t.completed),
        }));
        const picked = pickFollowUpTask(tasks);
        if (picked) out.set(contactId, picked);
      } catch (err) {
        // One contact's tasks failing must not empty the column for everyone.
        console.warn(`[leadWhen] tasks failed for contact ${contactId}`, err);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(TASK_CONCURRENCY, ids.length) }, () => worker()),
  );
  return out;
}
