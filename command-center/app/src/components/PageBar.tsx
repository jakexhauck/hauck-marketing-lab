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
  // The client app's global cluster (the notification bell). Off for the admin
  // console, which has its own rail and no client session to ring a bell for:
  // rendering it there was an empty box holding open 
  // space at the end of every admin header.
  globalControls = true,
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
  globalControls?: boolean;
}) {
  const label = section ?? sectionLabel(tabs);
  // Is there a tab row at all? Drives both whether the <nav> renders and which
  // element absorbs the leftover width on desktop, so the two can never
  // disagree and strand the global controls mid-row.
  const hasTabRow = tabs.length > 0 || Boolean(children);
  return (
    <div className={(flush ? "" : "mb-5 ") + "shrink-0"}>
      {/* One row on desktop; two on a phone. A 375px viewport cannot hold a
          title, five tabs and an action button side by side: the tab scroller
          was collapsing to whatever was left (often ~120px), so Outreach and
          Social showed ONE tab and silently hid the rest inside a scroller with
          no affordance. Clients never found those pages.

          So below lg the panel wraps: title + actions on the first line, the
          full-width tab track on the second. `order-*` keeps the DESKTOP order
          (title, tabs, actions, bell) intact while the phone reads
          title/actions first, because the tab nav is what needs the whole
          width and wrapping is by source order otherwise. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-[var(--shadow-sm)] lg:flex-nowrap">
        {/* Section name. Centred on a phone (matching <PageHeader>), pinned
            left on desktop. */}
        <div
          className={
            "order-1 flex w-full min-w-0 basis-full items-baseline justify-center gap-2.5 lg:w-auto lg:basis-auto lg:justify-start " +
            // With a tab row present the nav takes the slack (lg:flex-1) and the
            // title stays its natural width. With no tab row the title takes it
            // instead, so the actions and the bell stay pinned right on desktop
            // rather than sliding in beside the title.
            (hasTabRow ? "lg:shrink-0" : "lg:flex-1")
          }
        >
          <h2 className="truncate font-display text-[16px] font-semibold leading-none tracking-[-0.01em] text-text lg:whitespace-nowrap">
            {label}
          </h2>
          {count != null && <span className="font-data text-[12px] text-faint tnum">{count}</span>}
        </div>

        {/* The segmented tab control, plus any in-place filter tabs beside it.
            Phone: basis-full drops it onto its own line at full width. Desktop:
            min-w-0 + overflow-x-auto so a section with many tabs scrolls inside
            the panel instead of stretching it.

            Not rendered at all when there is nothing to put in it. A tab-less
            section (Schedule, Inbox, Leads) still produced this <nav> as a
            ZERO-HEIGHT wrap line, and an empty line still costs a full gap-y-3,
            so every tab-less header carried 12px of dead space under its
            title. TabLinks already self-hides on an empty list, which is what
            made the leftover row invisible and easy to miss. */}
        {hasTabRow && (
          <nav
            aria-label="Section pages"
            className="order-3 flex w-full min-w-0 basis-full items-center justify-center gap-3 overflow-x-auto lg:order-2 lg:w-auto lg:flex-1 lg:basis-auto lg:justify-start"
            style={{ scrollbarWidth: "none" }}
          >
            <TabLinks tabs={tabs} />
            {children}
          </nav>
        )}

        {/* Page actions (all sizes) + global controls (desktop only). Phone:
            ml-auto parks them at the right end of the title line. */}
        {/* mx-auto on a phone: with the title taking a full row of its own, the
            actions land alone on the next one, and ml-auto pinned them hard
            right under a centred title. Centred reads as deliberate. */}
        {actions && (
          <div className="order-2 mx-auto flex shrink-0 items-center gap-2.5 lg:order-3 lg:mx-0">
            {actions}
          </div>
        )}
        {/* hidden below lg: on a phone this renders nothing, but as a flex ITEM
            it still wrapped onto a phantom extra row and padded the card. */}
        {globalControls && (
          <div className="order-4 hidden shrink-0 lg:block">
            <GlobalControls />
          </div>
        )}
      </div>

      {filters && <div className="mt-4 flex flex-wrap items-center gap-2">{filters}</div>}
    </div>
  );
}
