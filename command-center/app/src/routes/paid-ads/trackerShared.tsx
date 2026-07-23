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

export const STATUS_META: Record<LeadTrackerStatus, { label: string; chip: string }> = {
  new: { label: "New", chip: "bg-brand/10 text-brand" },
  contacted: { label: "Contacted", chip: "bg-warning/10 text-warning" },
  booked: { label: "Booked", chip: "bg-brand/10 text-brand" },
  sold: { label: "Sold", chip: "bg-positive-tint text-positive" },
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
