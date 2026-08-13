import { Search } from "lucide-react";
import { cn } from "../../lib/cn";
import { formatMoney, formatMoneyExact } from "../../lib/formatMoney";
import type { AdTrackerLevel, AdTrackerRange, LeadTrackerStatus } from "../../lib/api";

// Shared bits across the Paid Ads tracker tabs (Dashboard, Lead Tracker,
// Pipeline Stats), ported from the client tracking sheet. Formatting rules
// match the sheet: a null ratio renders "-", never a fabricated zero.

// Ads Manager's presets, named the way Ads Manager names them.
//
// Was All Time / 7 / 30 / 90 Days, which looked like Meta's ranges and was not
// one of them: Meta's "Last 7 days" ends yesterday, ours ran to today, and
// nothing on either screen said the two were covering different days.
//
// DEFAULT_RANGE is last_30d, matching what Ads Manager opens on, so a client
// comparing the two screens is comparing the same window by default.
export const RANGES: { id: AdTrackerRange; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last_7d", label: "Last 7 days" },
  { id: "last_14d", label: "Last 14 days" },
  { id: "last_30d", label: "Last 30 days" },
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "maximum", label: "Maximum" },
];

export const DEFAULT_RANGE: AdTrackerRange = "last_30d";

export const LEVELS: { id: AdTrackerLevel; label: string }[] = [
  { id: "campaign", label: "Campaign" },
  { id: "adset", label: "Ad Set" },
  { id: "ad", label: "Ad" },
];

// Jake's 12-status model, in journey order. Four chip families so the column
// scans at a glance without the client reading every word:
//   quiet   nothing has happened yet, or the lead is parked
//   brand   we are moving them along (contacted, handed off, appointments)
//   warning we are chasing them and waiting on a reply
//   result  won or lost
// Several statuses deliberately share a chip; the label carries the detail.
export const STATUS_META: Record<LeadTrackerStatus, { label: string; chip: string }> = {
  new: { label: "New", chip: "bg-surface-2 text-muted" },
  contacted: { label: "Contacted", chip: "bg-brand/10 text-brand" },
  phone_follow_up: { label: "Phone Follow Up", chip: "bg-warning/10 text-warning" },
  long_term_nurture: { label: "Long Term Nurture", chip: "bg-surface-2 text-faint" },
  phone_appt_booked: { label: "Phone Appointment Booked", chip: "bg-brand/10 text-brand" },
  phone_appt_confirmed: { label: "Phone Appointment Confirmed", chip: "bg-brand/20 text-brand" },
  handed_off: { label: "Handed Off", chip: "bg-brand/10 text-brand" },
  follow_up: { label: "Follow Up", chip: "bg-warning/10 text-warning" },
  estimate_booked: { label: "Estimate Booked", chip: "bg-brand/20 text-brand" },
  job_booked: { label: "Job Booked", chip: "bg-brand/20 text-brand" },
  won: { label: "Won", chip: "bg-positive-tint text-positive" },
  lost: { label: "Lost", chip: "bg-danger-tint text-danger" },

  // The manual eight (0102). Four of them (new, contacted, follow_up, won,
  // lost) are spelled the same as the derived ones above and share their
  // colour, which is the point: a client who has seen one tracker reads the
  // other without relearning it.
  no_answer: { label: "No Answer", chip: "bg-surface-2 text-muted" },
  appointment_booked: { label: "Appointment Booked", chip: "bg-brand/20 text-brand" },
  quoted: { label: "Quoted", chip: "bg-info-tint text-info" },
};

export function pct(value: number | null): string {
  return value === null ? "-" : `${(value * 100).toFixed(1)}%`;
}

export function roas(value: number | null): string {
  return value === null ? "-" : `${value.toFixed(2)}x`;
}

export function money0(value: number): string {
  return formatMoney(value);
}

export function money2(value: number | null): string {
  return value === null ? "-" : formatMoneyExact(value);
}

// The "when" cell: a date plus the time of day, in the viewer's local zone.
// Returns "" for a missing or unparseable value so the cell falls back to "-"
// rather than printing "Invalid Date" at the client.
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = d
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .toLowerCase()
    .replace(" ", "");
  return `${date}, ${time}`;
}

// True once a follow-up due date is in the past. Overdue follow-ups are the
// ones worth the client's attention, so the cell leans on this rather than
// hiding them.
export function isOverdue(iso: string): boolean {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t < Date.now();
}

export function formatLeadDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex shrink-0 overflow-hidden rounded-[var(--radius)] border border-border"
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            "border-border px-3 py-1.5 text-[12px] font-medium transition-colors [&+&]:border-l",
            o.id === value ? "bg-brand/10 font-semibold text-brand" : "text-muted hover:text-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// The Lead Tracker's search box. Shared so the client page and the admin
// cockpit render the same control, even though each mounts it into its own
// page chrome.
export function LeadSearch({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <label className={cn("relative max-w-xs flex-1", className)}>
      <Search
        size={15}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search leads or ads"
        aria-label="Search leads"
        className="w-full rounded-[var(--radius)] border border-border bg-surface py-2 pl-9 pr-3 text-[13.5px] text-text placeholder:text-faint focus:border-brand focus:outline-none"
      />
    </label>
  );
}

// Filter a lead list by name, email, ad, campaign or phone digits. Shared so
// the two surfaces cannot disagree about what "matches".
export function filterLeads<
  T extends {
    name: string;
    email: string;
    phone: string;
    adName: string | null;
    campaignName: string | null;
  },
>(leads: T[], search: string): T[] {
  const trimmed = search.trim();
  if (!trimmed) return leads;
  const q = trimmed.toLowerCase();
  const qDigits = trimmed.replace(/\D+/g, "");
  return leads.filter((l) => {
    if (l.name.toLowerCase().includes(q)) return true;
    if (l.email.toLowerCase().includes(q)) return true;
    if ((l.adName ?? "").toLowerCase().includes(q)) return true;
    if ((l.campaignName ?? "").toLowerCase().includes(q)) return true;
    if (qDigits.length > 0 && l.phone.replace(/\D+/g, "").includes(qDigits)) return true;
    return false;
  });
}

export function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-surface px-3.5 py-3">
      <span className="text-[11px] font-medium text-faint">{label}</span>
      <span className="font-data text-[20px] font-semibold tracking-tight text-text tnum">
        {value}
      </span>
      {hint ? <span className="text-[11px] text-faint tnum">{hint}</span> : null}
    </div>
  );
}

// Shared loading / error / spinner states so every tab reads the same.
export function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand"
        aria-hidden
      />
    </div>
  );
}

export function ErrorNote({ message }: { message?: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
      Could not load this data. {message ?? ""}
    </div>
  );
}
