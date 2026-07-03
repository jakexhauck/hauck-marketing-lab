import { CAPABILITIES } from "./capabilities";

// Pure helpers for the cockpit Overview tab (Task 3.3). Kept out of the
// component so account-age formatting and the enabled-surfaces summary are
// testable without React or a network mock. Every input here comes straight
// off GET /api/admin/clients/:tenantId; nothing here invents a number.

// "Team size" on the Overview KPI row is the count of active staff logins,
// the same definition the roster list's memberCount already uses.
export function activeStaffCount(staff: { status: string }[]): number {
  return staff.filter((s) => s.status === "active").length;
}

// Human account age from a tenant's createdAt ISO string: "New today",
// "12 days", "3 months", "1 year", "1 year 4 months". Returns "-" for an
// unparseable date rather than fabricating an age.
export function formatAccountAge(createdAt: string, now: number = Date.now()): string {
  const then = new Date(createdAt).getTime();
  if (Number.isNaN(then)) return "-";
  const diffMs = Math.max(0, now - then);
  const days = Math.floor(diffMs / 86_400_000);
  if (days < 1) return "New today";
  if (days < 30) return `${days} day${days === 1 ? "" : "s"}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (remMonths === 0) return `${years} year${years === 1 ? "" : "s"}`;
  return `${years} year${years === 1 ? "" : "s"} ${remMonths} month${remMonths === 1 ? "" : "s"}`;
}

export interface EnabledSurfacesSummary {
  count: number;
  total: number;
  labels: string[];
}

// Which of the agency's known surfaces this client has turned on, keyed off
// the same CAPABILITIES registry the Config tab's toggles use, so the two
// never drift.
export function enabledSurfacesSummary(entitlements: string[]): EnabledSurfacesSummary {
  const enabled = new Set(entitlements);
  const labels = CAPABILITIES.filter((c) => enabled.has(c.key)).map((c) => c.label);
  return { count: labels.length, total: CAPABILITIES.length, labels };
}
