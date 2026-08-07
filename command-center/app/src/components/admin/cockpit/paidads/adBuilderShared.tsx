import { cn } from "../../../../lib/cn";
import type { AdWorkspacePatch } from "../../../../../functions/lib/adWorkspace";

// Small pieces shared by the ad builder's three pages (Copy & Angles, Ads,
// Lead Form). Kept here rather than in trackerShared because none of it is
// about tracking: that file is the client's numbers, this is the operator's
// drafting table.

// How a page hands one block back to be written. The panel owns the request;
// a page only ever says which block changed.
export type SaveBlock = (patch: AdWorkspacePatch) => void;

export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// The small grey heading above each block inside a card.
export function SectionLabel({ children, hint }: { children: string; hint?: string }) {
  return (
    <div className="mb-2 flex items-baseline gap-2">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-faint">{children}</h4>
      {hint ? <span className="text-[11.5px] text-faint">{hint}</span> : null}
    </div>
  );
}

const FIELD_BASE =
  "w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[13.5px] " +
  "text-text placeholder:text-faint focus:border-brand focus:outline-none";

export function LineInput({
  value,
  onChange,
  onBlur,
  placeholder,
  maxLength,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  placeholder?: string;
  maxLength: number;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      maxLength={maxLength}
      aria-label={ariaLabel}
      className={cn(FIELD_BASE, className)}
    />
  );
}

export function BlockInput({
  value,
  onChange,
  onBlur,
  placeholder,
  maxLength,
  ariaLabel,
  rows = 4,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  placeholder?: string;
  maxLength: number;
  ariaLabel: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      maxLength={maxLength}
      aria-label={ariaLabel}
      rows={rows}
      className={cn(FIELD_BASE, "resize-y leading-snug")}
    />
  );
}

// Read-only text that keeps its line breaks. Used everywhere Master draws copy
// or a script: a primary written as three paragraphs has to read as three
// paragraphs, and an empty one has to say so rather than leave a silent gap.
export function ReadBlock({ value, empty }: { value: string; empty: string }) {
  if (!value.trim()) return <p className="text-[13px] italic text-faint">{empty}</p>;
  return <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-text">{value}</p>;
}

// The numbered "1 / 2 / 3" marker beside a copy or headline slot. The number is
// the point: these are the three that get launched, in this order.
export function SlotNumber({ n }: { n: number }) {
  return (
    <span className="mt-2 w-4 shrink-0 font-data text-[12px] font-semibold text-faint tnum">
      {n}
    </span>
  );
}
