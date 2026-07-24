import { cn } from "../../lib/cn";
import { formatMoney, formatMoneyExact } from "../../lib/formatMoney";
import type { AdTrackerLevel, AdTrackerRange, LeadTrackerStatus } from "../../lib/api";

// Shared bits across the Paid Ads tracker tabs (Dashboard, Lead Tracker,
// Pipeline Stats), ported from the client tracking sheet. Formatting rules
// match the sheet: a null ratio renders "-", never a fabricated zero.

export const RANGES: { id: AdTrackerRange; label: string }[] = [
  { id: "all", label: "All Time" },
  { id: "7", label: "7 Days" },
  { id: "30", label: "30 Days" },
  { id: "90", label: "90 Days" },
];

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
