import { useMemo } from "react";
import { demoMode } from "../demo/demoMode";
import { DEMO_JOBS, type Job } from "../lib/jobsPipeline";
import { occurrences } from "../lib/recurrence";
import { DEMO_CUSTOMERS, type Customer } from "../lib/customers";
import { useRecurrence } from "./useRecurrence";
import type { ApiRecurrence } from "../lib/api";

// The Jobs (Sales) surface reads its work through this hook so the page stays
// source-agnostic. It merges two sources: the pipeline jobs (DEMO_JOBS in
// demo/preview mode, empty until the live GHL feed lands) with generated
// visits from each customer's active recurrence (Task 8), so a recurring
// customer's future work shows up on the calendar without a separate job
// record. When the live pipeline source lands, swap the pipeline half for a
// query against the Sales Pipeline at the Job Booked + Job Completed stages
// and keep the return shape: nothing downstream changes.

// Minutes-past-midnight for a "9:00 AM" style time (defaults to 9:00 AM).
function toStartMinutes(time: string | null): { time: string; startMinutes: number } {
  const t = time && /\d/.test(time) ? time : "9:00 AM";
  const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return { time: t, startMinutes: 540 };
  let h = Number(m[1]) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return { time: t, startMinutes: h * 60 + Number(m[2]) };
}

// Pure: expand active recurrences into generated calendar jobs over a window.
export function recurringJobs(
  customers: Customer[],
  byContact: Record<string, ApiRecurrence>,
  startIso: string,
  endIso: string,
): Job[] {
  const jobs: Job[] = [];
  const byId = new Map(customers.map((c) => [c.id, c]));
  for (const r of Object.values(byContact)) {
    if (!r.active) continue;
    const c = byId.get(r.contactId);
    if (!c) continue;
    const { time, startMinutes } = toStartMinutes(r.visitTime);
    for (const date of occurrences(
      { cadenceWeeks: r.cadenceWeeks, weekday: r.weekday, anchorDate: r.anchorDate },
      startIso,
      endIso,
    )) {
      jobs.push({
        id: `rec:${c.id}:${date}`,
        customer: c.name,
        service: r.service || "Recurring visit",
        city: c.city,
        zip: "",
        phone: c.phone,
        date,
        time,
        startMinutes,
        amount: r.priceCents == null ? 0 : Math.round(r.priceCents / 100),
        status: "booked",
        paid: false,
      });
    }
  }
  return jobs;
}

// Default window: current month +/- one month, so a freshly opened calendar
// always has generated visits without the caller passing a range.
function isoOf(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function defaultWindow(): { startIso: string; endIso: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  return { startIso: isoOf(start), endIso: isoOf(end) };
}

export function useJobs(window?: { startIso: string; endIso: string }): Job[] {
  const demo = demoMode();
  const { byContact } = useRecurrence();
  const win = window ?? defaultWindow();
  return useMemo(() => {
    const base = demo ? DEMO_JOBS : [];
    const generated = recurringJobs(demo ? DEMO_CUSTOMERS : [], byContact, win.startIso, win.endIso);
    return [...base, ...generated];
  }, [demo, byContact, win.startIso, win.endIso]);
}
