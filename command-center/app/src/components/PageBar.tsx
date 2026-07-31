import type { ReactNode } from "react";
import { TabLinks } from "./PageTabs";
import GlobalControls from "./desktop/GlobalControls";
import { sectionLabel, type PageTab } from "../lib/pageTabs";

// The Marketing section header, as a FLOATING PANEL: a raised surface card
// carrying the section name, the segmented tab control, the page's own actions
// and the global controls. It sits on the page background rather than being a
// bare row divided off by a rule, so the chrome reads as an object and the
// content below it starts clean.
//
// No description slot. Explanatory paragraphs under a header are banned across
// the client app on Jake's instruction: the section name and the tab labels say
// what the page is, and the paragraph only ever pushed the real content down.
// A page that genuinely needs to explain itself should do it next to the thing
// being explained, not in the chrome.
export default function PageBar({
  tabs,
  section,
  count,
  actions,
  filters,
  children,
  flush,
}: {
  tabs: PageTab[];
  // Defaults to the label mapped from `tabs` (sidebar section name). Pass to
  // override for a one-off.
  section?: string;
  count?: ReactNode;
  actions?: ReactNode;
  filters?: ReactNode;
  // In-row tabs that are NOT route links — the Inbox and Reviews Chats filter
  // in place, so their stage tabs are buttons. Rendered beside the segmented
  // track rather than inside it, since they are a different kind of control.
  children?: ReactNode;
  // Drops the bottom margin, for pages whose content owns the space under the
  // panel (the two-pane inboxes butt their panes straight against it).
  flush?: boolean;
}) {
  const label = section ?? sectionLabel(tabs);
  return (
    <div className={(flush ? "" : "mb-5 ") + "shrink-0"}>
      <div className="flex items-center gap-4 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-[var(--shadow-sm)]">
        {/* Section name, pinned left */}
        <div className="flex shrink-0 items-baseline gap-2.5">
          <h2 className="whitespace-nowrap font-display text-[16px] font-semibold leading-none tracking-[-0.01em] text-text">
            {label}
          </h2>
          {count != null && <span className="font-data text-[12px] text-faint tnum">{count}</span>}
        </div>

        {/* The segmented tab control, plus any in-place filter tabs beside it.
            min-w-0 + overflow-x-auto so a section with many tabs scrolls inside
            the panel instead of stretching it. */}
        <nav
          aria-label="Section pages"
          className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto"
          style={{ scrollbarWidth: "none" }}
        >
          <TabLinks tabs={tabs} />
          {children}
        </nav>

        {/* Page actions (all sizes) + global controls (desktop only), pinned right */}
        {actions && <div className="flex shrink-0 items-center gap-2.5">{actions}</div>}
        <div className="shrink-0">
          <GlobalControls />
        </div>
      </div>

      {filters && <div className="mt-4 flex flex-wrap items-center gap-2">{filters}</div>}
    </div>
  );
}
