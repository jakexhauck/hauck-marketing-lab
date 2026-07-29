import type { AdminLead, AdminLeadStatus } from "./api";
import { COLD_CALL_STAGES } from "./coldCallStages";

// Pure helpers for the Acquisition lead surfaces: the status vocabulary, its
// colour tokens, and the list math behind the stage tiles and the sortable
// table. No React and no network, so the components and the unit tests read
// from exactly one source of truth.
//
// The vocabulary is no longer invented here: it is the Cold Call Leads pipeline,
// mirrored in lib/coldCallStages.ts, so every page correlates to a real GHL
// stage. It also mirrors the CHECK constraint on admin_leads.status and the
// server copy in functions/api/admin/tracker/leads.ts.

export const LEAD_STATUSES: AdminLeadStatus[] = COLD_CALL_STAGES.map(
  (s) => s.label as AdminLeadStatus,
);

// "All" is the unfiltered tile, not a stored status.
export type LeadFilter = AdminLeadStatus | "All";

export interface LeadStatusMeta {
  // Filter-tile modifier class (colours the icon chip, border and tint).
  tileClass: string;
  // Table pill modifier class (tinted background + dot).
  pillClass: string;
  // The raw swatch colour, used for the dots in the status popover.
  swatch: string;
  label: string;
}

// Built from the stage list so a stage rename or recolour never needs a second
// edit here. `label` is the short tile label; the stored status is the key.
export const STATUS_META: Record<AdminLeadStatus, LeadStatusMeta> =
  COLD_CALL_STAGES.reduce(
    (acc, stage) => {
      acc[stage.label as AdminLeadStatus] = {
        tileClass: stage.tileClass,
        pillClass: stage.pillClass,
        swatch: stage.swatch,
        label: stage.short,
      };
      return acc;
    },
    {} as Record<AdminLeadStatus, LeadStatusMeta>,
  );

// Every status keyed to 0, so an empty list still renders a full tile strip.
function zeroCounts(): Record<AdminLeadStatus, number> {
  const out = {} as Record<AdminLeadStatus, number>;
  for (const status of LEAD_STATUSES) out[status] = 0;
  return out;
}

export function countByStatus(leads: AdminLead[]): Record<AdminLeadStatus, number> {
  const counts = zeroCounts();
  for (const lead of leads) {
    if (lead.status in counts) counts[lead.status] += 1;
  }
  return counts;
}

export function totalCount(leads: AdminLead[]): number {
  return leads.length;
}

export function filterByStatus(leads: AdminLead[], filter: LeadFilter): AdminLead[] {
  if (filter === "All") return leads.slice();
  return leads.filter((lead) => lead.status === filter);
}

// The sortable columns, matching the mockup's header row.
export type LeadSortKey =
  | "firstName"
  | "lastName"
  | "phone"
  | "timezone"
  | "status"
  | "firstContactDate"
  | "source"
  | "appointmentDate"
  | "noAnswer"
  | "lastContact"
  | "followUpDate"
  | "email"
  | "notes";

export type LeadSortDir = "asc" | "desc";

const DATE_KEYS: LeadSortKey[] = [
  "firstContactDate",
  "appointmentDate",
  "lastContact",
  "followUpDate",
];

// Sort a list without mutating it. Empty dates always sink to the bottom in
// both directions: a blank cell is missing data, not an early date.
export function sortLeads(
  leads: AdminLead[],
  key: LeadSortKey,
  dir: LeadSortDir,
): AdminLead[] {
  const sign = dir === "desc" ? -1 : 1;
  const isDate = DATE_KEYS.includes(key);

  return leads.slice().sort((a, b) => {
    if (isDate) {
      const av = a[key] as string | null;
      const bv = b[key] as string | null;
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      return av < bv ? -sign : av > bv ? sign : 0;
    }
    if (key === "noAnswer") {
      return (a.noAnswer - b.noAnswer) * sign;
    }
    if (key === "status") {
      return (LEAD_STATUSES.indexOf(a.status) - LEAD_STATUSES.indexOf(b.status)) * sign;
    }
    return String(a[key] ?? "").localeCompare(String(b[key] ?? "")) * sign;
  });
}

// Today as a UTC YYYY-MM-DD, matching the endpoint's server-side default so an
// optimistic row and the row that comes back agree on the date.
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// The client-side shape of a not-yet-saved row. The temp id is swapped for the
// real one when the POST resolves.
export function blankLeadDraft(tempId = `temp-${Date.now()}`): AdminLead {
  const today = todayIso();
  return {
    id: tempId,
    firstName: "",
    lastName: "",
    phone: "",
    timezone: "",
    status: "New Lead",
    firstContactDate: today,
    source: "",
    appointmentDate: null,
    noAnswer: 0,
    lastContact: today,
    followUpDate: null,
    email: "",
    notes: "",
    createdAt: new Date().toISOString(),
  };
}
