// ===========================================================================
// Jobs (Sales) — the booked + completed work calendar. DEMO DATA + real map.
//
// This is the "Jobs" Sales surface (`/sales/jobs`): the tail of the Sales spine.
// Once a lead is closed it becomes a job at the "Job Booked" stage of the GHL
// Sales Pipeline (id below); when the work is done it moves to "Job Completed".
// This page reads only those two stages and lays them out on a month calendar:
// pick a day, see and work its jobs (mark completed, reschedule, take payment).
//
// The two STATUSES map to the REAL GoHighLevel Sales Pipeline stages (pulled
// from client #1, Willis Windows — identical template for every client). When
// the live feed lands (opportunities in pipeline `SALES_PIPELINE_ID` at the two
// job stages, joined to their appointment for date/time + value), replace
// `DEMO_JOBS` with a fetch and map each opportunity to a `Job`; the UI reads
// only these types.
// ===========================================================================

import type { Tone } from "./status";

// GoHighLevel pipeline this surface reads (same template across all clients).
export const SALES_PIPELINE_ID = "6o9Gx6e0TXRFJdln5d01";

// The two Sales Pipeline stages this page covers, with their exact GHL names.
export const JOB_BOOKED_STAGE = "Job Booked";
export const JOB_COMPLETED_STAGE = "Job Completed";

// A job's lifecycle on this page. `booked` = scheduled, not yet done;
// `completed` = work done (payment tracked separately via `paid`).
export type JobStatus = "booked" | "completed";

// What a calendar day's dot means. A completed-but-unpaid job is called out in
// amber so money owed never hides inside the green "done" pile.
export type DayKind = "booked" | "completed" | "unpaid";

export interface Job {
  id: string;
  customer: string;
  service: string;
  city: string;
  zip: string;
  phone: string;
  // Local calendar date, "YYYY-MM-DD" (no timezone math — the date is the date).
  date: string;
  // Display time, e.g. "9:00 AM".
  time: string;
  // Minutes past midnight, for stable same-day ordering.
  startMinutes: number;
  // Job value in whole dollars.
  amount: number;
  status: JobStatus;
  // Only meaningful when status === "completed".
  paid: boolean;
}

// The dot/badge kind for a job: unpaid completed work is its own call-out.
export function jobKind(job: Job): DayKind {
  if (job.status === "booked") return "booked";
  return job.paid ? "completed" : "unpaid";
}

// Tone for each kind, reusing the app's semantic status tones.
export const KIND_TONE: Record<DayKind, Tone> = {
  booked: "brand",
  completed: "positive",
  unpaid: "warning",
};

export const KIND_LABEL: Record<DayKind, string> = {
  booked: "Booked",
  completed: "Paid",
  unpaid: "Unpaid",
};

export function jobInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatMoney(amount: number): string {
  return MONEY.format(amount);
}

// One cell of a month grid. `inMonth` is false for the leading/trailing days
// that belong to the neighbouring month but fill out the 6x7 grid.
export interface DayCell {
  iso: string;
  day: number;
  inMonth: boolean;
}

// Build a Sunday-first 6-row month grid for the given year + 0-based month.
// Pure date arithmetic on local Date; safe in app code (only workflow scripts
// forbid Date).
export function monthGrid(year: number, month: number): DayCell[][] {
  const first = new Date(year, month, 1);
  const startOffset = first.getDay(); // 0 = Sunday
  const gridStart = new Date(year, month, 1 - startOffset);
  const weeks: DayCell[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: DayCell[] = [];
    for (let d = 0; d < 7; d++) {
      const cur = new Date(
        gridStart.getFullYear(),
        gridStart.getMonth(),
        gridStart.getDate() + w * 7 + d,
      );
      row.push({
        iso: toIso(cur),
        day: cur.getDate(),
        inMonth: cur.getMonth() === month,
      });
    }
    weeks.push(row);
  }
  return weeks;
}

export function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// "Thursday, July 3" from an ISO date (parsed as local, no TZ shift).
export function formatLongDay(iso: string): string {
  const d = isoToLocalDate(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function isoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Jobs on a given day, earliest first.
export function jobsOnDay(jobs: Job[], iso: string): Job[] {
  return jobs
    .filter((j) => j.date === iso)
    .sort((a, b) => a.startMinutes - b.startMinutes);
}

// The distinct dot kinds present on a day (for the calendar dots).
export function dayKinds(jobs: Job[], iso: string): DayKind[] {
  const kinds = new Set<DayKind>();
  for (const j of jobs) if (j.date === iso) kinds.add(jobKind(j));
  // Stable order: booked, completed, unpaid.
  return (["booked", "completed", "unpaid"] as DayKind[]).filter((k) =>
    kinds.has(k),
  );
}

export interface MonthSummary {
  booked: number;
  completed: number;
  unpaid: number;
  unpaidValue: number;
  bookedValue: number;
  collected: number;
}

// Roll the jobs that fall inside a given month into the summary shown under the
// calendar. Honest counts derived from the data, never hardcoded.
export function monthSummary(jobs: Job[], year: number, month: number): MonthSummary {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
  const inMonth = jobs.filter((j) => j.date.startsWith(prefix));
  let booked = 0,
    completed = 0,
    unpaid = 0,
    unpaidValue = 0,
    bookedValue = 0,
    collected = 0;
  for (const j of inMonth) {
    if (j.status === "booked") {
      booked++;
      bookedValue += j.amount;
    } else {
      completed++;
      if (j.paid) collected += j.amount;
      else {
        unpaid++;
        unpaidValue += j.amount;
      }
    }
  }
  return { booked, completed, unpaid, unpaidValue, bookedValue, collected };
}

// --------------------------------------------------------------------------
// DEMO DATA — Willis Windows, July 2026. Replaced by a live GHL feed later.
// Anchored to a fixed month so the preview always reads as a full schedule
// regardless of the real date.
// --------------------------------------------------------------------------

export const DEMO_MONTH = { year: 2026, month: 6 }; // July 2026 (0-based)
export const DEMO_DEFAULT_DAY = "2026-07-03";

export const DEMO_JOBS: Job[] = [
  // --- Completed earlier in July ---
  { id: "j1", customer: "Dana Park", service: "Full exterior + screens", city: "Warren", zip: "48091", phone: "(586) 555-0148", date: "2026-06-30", time: "8:00 AM", startMinutes: 480, amount: 520, status: "completed", paid: true },
  { id: "j2", customer: "Greg Olsen", service: "Exterior windows, 1-story", city: "Sterling Heights", zip: "48310", phone: "(586) 555-0193", date: "2026-07-01", time: "11:00 AM", startMinutes: 660, amount: 410, status: "completed", paid: true },
  { id: "j3", customer: "Sofia Russo", service: "2-story full house + skylights", city: "Bloomfield", zip: "48302", phone: "(248) 555-0177", date: "2026-07-02", time: "9:30 AM", startMinutes: 570, amount: 675, status: "completed", paid: false },
  { id: "j4", customer: "Aaron Webb", service: "Storefront, monthly", city: "Ferndale", zip: "48220", phone: "(248) 555-0121", date: "2026-07-01", time: "7:30 AM", startMinutes: 450, amount: 240, status: "completed", paid: true },
  { id: "j5", customer: "Lena Cho", service: "Exterior + screen repair", city: "Berkley", zip: "48072", phone: "(248) 555-0166", date: "2026-07-02", time: "2:00 PM", startMinutes: 840, amount: 360, status: "completed", paid: true },

  // --- Booked, this week ---
  { id: "j6", customer: "Tom Willis", service: "Full exterior + screens · 2-story", city: "Rochester Hills", zip: "48307", phone: "(248) 555-0162", date: "2026-07-03", time: "9:00 AM", startMinutes: 540, amount: 450, status: "booked", paid: false },
  { id: "j7", customer: "Janet Doe", service: "Exterior windows · ranch", city: "Troy", zip: "48084", phone: "(248) 555-0184", date: "2026-07-04", time: "1:00 PM", startMinutes: 780, amount: 300, status: "booked", paid: false },
  { id: "j8", customer: "Kevin Lee", service: "2-story full house, in + out", city: "Birmingham", zip: "48009", phone: "(248) 555-0139", date: "2026-07-05", time: "8:00 AM", startMinutes: 480, amount: 600, status: "booked", paid: false },
  { id: "j9", customer: "Maria Santos", service: "Exterior windows + gutter clear", city: "Royal Oak", zip: "48067", phone: "(248) 555-0158", date: "2026-07-05", time: "1:30 PM", startMinutes: 810, amount: 380, status: "booked", paid: false },

  // --- Booked, later in the month (fills the calendar) ---
  { id: "j10", customer: "Priya Nair", service: "Full house exterior", city: "Rochester Hills", zip: "48307", phone: "(248) 555-0151", date: "2026-07-07", time: "10:30 AM", startMinutes: 630, amount: 470, status: "booked", paid: false },
  { id: "j11", customer: "Marcus Bell", service: "Exterior + screens, 18 windows", city: "Troy", zip: "48084", phone: "(248) 555-0112", date: "2026-07-09", time: "9:00 AM", startMinutes: 540, amount: 340, status: "booked", paid: false },
  { id: "j12", customer: "Dana Whitfield", service: "2-story full house", city: "Birmingham", zip: "48009", phone: "(248) 555-0190", date: "2026-07-11", time: "8:30 AM", startMinutes: 510, amount: 620, status: "booked", paid: false },
  { id: "j13", customer: "Carl Jensen", service: "Exterior, single story", city: "Madison Heights", zip: "48071", phone: "(248) 555-0173", date: "2026-07-11", time: "1:00 PM", startMinutes: 780, amount: 290, status: "booked", paid: false },
  { id: "j14", customer: "Olivia Grant", service: "Full exterior + gutters", city: "Clawson", zip: "48017", phone: "(248) 555-0145", date: "2026-07-14", time: "11:00 AM", startMinutes: 660, amount: 410, status: "booked", paid: false },
  { id: "j15", customer: "Nina Patel", service: "2-story exterior + skylights", city: "Bloomfield", zip: "48302", phone: "(248) 555-0168", date: "2026-07-17", time: "9:30 AM", startMinutes: 570, amount: 540, status: "booked", paid: false },
];
