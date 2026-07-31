import type { ReactNode } from "react";
import { PageHeader } from "../PageHeader";
import PageBar from "../PageBar";

// Shared chrome for every client desktop (lg+) surface. One structure across the
// whole app: the sidebar (which owns account controls) beside a full-width
// content column that opens with the standard <PageHeader> floating panel
// (Poppins title + right-aligned actions). No centered max-width cap and no
// per-page top bar, so every page reads the same. See docs/PAGE_LAYOUT.md.
//
// No `subtitle` prop: header descriptions are banned across the client app, so
// there is nowhere for it to go and keeping it would invite it back.
export default function DesktopPage({
  title,
  actions,
  tabs,
  children,
  flush = false,
}: {
  // Omit for a page that opens with its own content instead of the standard
  // panel. Home does this: its greeting IS the heading, and a panel reading
  // "Home" above "Good afternoon" said the same thing twice.
  title?: ReactNode;
  actions?: ReactNode;
  // A page whose views switch in place (not by route) puts its segmented tab
  // track here, and the header becomes the same <PageBar> panel a Marketing
  // section uses: title, tabs, actions, one object. Built from TAB_TRACK and
  // TabButton, so an in-place switcher cannot drift from the route tabs.
  //
  // Without it the strip ends up as a second row of chrome under the panel,
  // which is what every one of these pages grew on its own and what made the
  // admin surfaces read as a different app from the client ones.
  tabs?: ReactNode;
  children: ReactNode;
  // Full-bleed surfaces (e.g. the Unified Inbox three-pane) keep the header but
  // hand the rest of the area to children, which manage their own scroll
  // regions, so the page itself does not scroll.
  flush?: boolean;
}) {
  const header =
    title == null && !tabs ? null : tabs ? (
      <PageBar
        tabs={[]}
        section={typeof title === "string" ? title : ""}
        actions={actions}
      >
        {tabs}
      </PageBar>
    ) : (
      <PageHeader title={title} actions={actions} />
    );

  return (
    <div
      className={
        "flex flex-1 flex-col " + (flush ? "overflow-hidden" : "overflow-y-auto")
      }
    >
      {flush ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="px-6 pt-5">{header}</div>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </div>
      ) : (
        <div className="fx-rise flex w-full flex-1 flex-col px-6 pb-12 pt-5">
          {header}
          {children}
        </div>
      )}
    </div>
  );
}
