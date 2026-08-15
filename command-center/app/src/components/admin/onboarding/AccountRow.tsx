import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

// One account in a flat list: initials, name, what they do and where, an
// optional control on the right, and their sheet underneath when open.
//
// Onboarding and Operations > Clients are the same list of the same records at
// two points in their life, so the row is one component rather than two copies
// that would drift the first time either was touched.

export interface AccountRowData {
  key: string;
  name: string;
  sub: string;
  initials: string;
  color: string;
  /** Present for a real client. Absent for a form nobody has stood up yet. */
  tenantId?: string;
  submissionId?: string;
}

export default function AccountRow({
  row,
  open,
  onToggle,
  action,
  children,
}: {
  row: AccountRowData;
  open: boolean;
  onToggle: () => void;
  /** The row's own control, if it has one. Onboarding puts Go live here. */
  action?: ReactNode;
  /** The sheet, rendered only while the row is open. */
  children: ReactNode;
}) {
  return (
    <div
      className={
        "overflow-hidden rounded-[var(--radius-lg)] border bg-surface transition-shadow " +
        (open
          ? "border-border-strong shadow-[var(--shadow-md)]"
          : "border-border shadow-[var(--shadow-sm)]")
      }
    >
      <div className="flex items-center gap-4 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius)] font-display text-[11px] font-bold text-white"
            style={{ background: row.color }}
            aria-hidden
          >
            {row.initials}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-semibold tracking-[-0.015em] text-text">
              {row.name}
            </span>
            <span className="block truncate text-[11.5px] text-faint">{row.sub}</span>
          </span>
        </button>

        {action}

        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? `Close ${row.name}` : `Open ${row.name}`}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-sm)] text-faint hover:bg-surface-2 hover:text-text"
        >
          <ChevronRight
            size={15}
            className={"transition-transform " + (open ? "rotate-90" : "")}
            aria-hidden
          />
        </button>
      </div>

      {open && children}
    </div>
  );
}

/** "Windows and siding · Meridian, ID", skipping whatever is missing. */
export function subtitle(niche: string, city: string, region: string): string {
  const place = [city, region].filter(Boolean).join(", ");
  return [niche, place].filter(Boolean).join(" · ");
}
