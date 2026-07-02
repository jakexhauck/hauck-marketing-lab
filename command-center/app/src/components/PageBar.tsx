import type { ReactNode } from "react";
import { TabLinks } from "./PageTabs";
import GlobalControls from "./desktop/GlobalControls";
import { sectionLabel, type PageTab } from "../lib/pageTabs";

// The Marketing section header (GHL-style): the bold section name sits to the
// LEFT of the in-page tabs, all on one line, with a single divider under the
// whole row. Replaces the old two-block layout (a standalone <PageTabs> bar
// stacked over a <PageHeader> title). Page actions and the global controls pin
// to the right of the same row; the page's description drops just under the
// divider. One component, so every section stays consistent.
export default function PageBar({
  tabs,
  section,
  count,
  description,
  actions,
  filters,
}: {
  tabs: PageTab[];
  // Defaults to the label mapped from `tabs` (sidebar section name). Pass to
  // override for a one-off.
  section?: string;
  count?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  filters?: ReactNode;
}) {
  const label = section ?? sectionLabel(tabs);
  return (
    <div className="mb-5 shrink-0">
      <div className="flex items-end gap-x-7 border-b border-[var(--border)]">
        {/* Section name, pinned left */}
        <div className="flex shrink-0 items-baseline gap-2.5 pb-3.5">
          <h2 className="whitespace-nowrap font-display text-[20px] leading-none tracking-tight text-text">
            {label}
          </h2>
          {count != null && (
            <span className="font-data text-sm text-faint tnum">{count}</span>
          )}
        </div>

        {/* Tabs, filling the space between the label and the right-side controls */}
        <nav
          aria-label="Section pages"
          className="flex min-w-0 flex-1 gap-6 overflow-x-auto"
          style={{ scrollbarWidth: "none" }}
        >
          <TabLinks tabs={tabs} />
        </nav>

        {/* Page actions (all sizes) + global controls (desktop only), pinned right */}
        {actions && (
          <div className="flex shrink-0 items-center gap-2.5 pb-2.5">{actions}</div>
        )}
        <div className="shrink-0 pb-2.5">
          <GlobalControls />
        </div>
      </div>

      {description && <p className="mt-3.5 text-sm text-muted">{description}</p>}
      {filters && (
        <div className="mt-4 flex flex-wrap items-center gap-2">{filters}</div>
      )}
    </div>
  );
}
