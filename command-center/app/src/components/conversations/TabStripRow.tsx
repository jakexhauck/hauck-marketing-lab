import type { ReactNode } from "react";

// A standalone scrollable row for stage tabs, used on MOBILE only.
//
// On desktop the stage tabs ride inside PageBar, on the same line as the section
// title — that is the whole point of the one-line header. A phone has no room
// for that: the tabs end up queued behind the section's page tabs in one
// scrolling row, so reaching "Job Completed" means scrolling past everything
// else. So on mobile they get their own row directly under the header instead.
export default function TabStripRow({ children }: { children: ReactNode }) {
  return (
    <nav
      aria-label="Stages"
      className="mb-3 flex shrink-0 gap-5 overflow-x-auto border-b border-[var(--border)] lg:hidden"
      style={{ scrollbarWidth: "none" }}
    >
      {children}
    </nav>
  );
}
