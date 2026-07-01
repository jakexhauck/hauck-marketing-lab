// command-center/app/src/hooks/useCustomers.ts
import { useMemo } from "react";
import { demoMode } from "../demo/demoMode";
import { useRecurrence } from "./useRecurrence";
import {
  DEMO_CUSTOMERS,
  applySchedule,
  type Customer,
  type CustomerWithSchedule,
} from "../lib/customers";
import type { ApiRecurrence } from "../lib/api";

// Pure: fold live recurrence rows onto the base customer set.
export function buildCustomers(
  base: Customer[],
  byContact: Record<string, ApiRecurrence>,
  todayIso: string,
): CustomerWithSchedule[] {
  return base.map((c) => {
    const r = byContact[c.id];
    if (!r || !r.active) return applySchedule(c, null, { todayIso });
    return applySchedule(
      c,
      { cadenceWeeks: r.cadenceWeeks, weekday: r.weekday, anchorDate: r.anchorDate },
      { service: r.service, priceCents: r.priceCents, todayIso },
    );
  });
}

// Demo/preview: the hand-authored set merged with in-tab recurrence edits.
// Real session: empty until the pipeline-derived customer feed lands (documented
// swap), but recurrence is still live. `connected` drives the not-connected notice.
export function useCustomers(todayIso: string): {
  customers: CustomerWithSchedule[];
  isLoading: boolean;
  connected: boolean;
} {
  const demo = demoMode();
  const { byContact, isLoading } = useRecurrence();
  const base = demo ? DEMO_CUSTOMERS : [];
  const customers = useMemo(
    () => buildCustomers(base, byContact, todayIso),
    [base, byContact, todayIso],
  );
  // v1: only the demo tab has a customer feed. A real session shows the
  // not-connected notice (recurrence still works) until the pipeline swap lands.
  return { customers, isLoading, connected: demo };
}
