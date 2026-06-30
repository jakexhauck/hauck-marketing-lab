import type { ReactNode } from "react";
import { PageHeader } from "../PageHeader";

// Shared chrome for every client desktop (lg+) surface. One structure across the
// whole app: the sidebar (which now owns the global controls: search, bell,
// agency chat, account menu) beside a full-width content column that opens with
// the standard <PageHeader> (Poppins title + description + right-aligned
// actions). No centered max-width cap and no per-page top bar, so every page
// reads the same. See docs/PAGE_LAYOUT.md.
export default function DesktopPage({
  title,
  subtitle,
  actions,
  children,
  flush = false,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  // Full-bleed surfaces (e.g. the Unified Inbox three-pane) keep the header but
  // hand the rest of the area to children, which manage their own scroll
  // regions, so the page itself does not scroll.
  flush?: boolean;
}) {
  return (
    <div
      className={
        "flex flex-1 flex-col " + (flush ? "overflow-hidden" : "overflow-y-auto")
      }
    >
      {flush ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="px-6 pt-5">
            <PageHeader title={title} description={subtitle} actions={actions} />
          </div>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </div>
      ) : (
        <div className="fx-rise flex w-full flex-1 flex-col px-6 pb-12 pt-5">
          <PageHeader title={title} description={subtitle} actions={actions} />
          {children}
        </div>
      )}
    </div>
  );
}
