import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import GlobalControls from "./desktop/GlobalControls";

// The header every tab-less desktop surface renders at the top of its scroll
// area, as the same FLOATING PANEL <PageBar> uses: a raised surface card with
// the title and count on the left, then the page's own actions and the global
// controls on the right. Tab-less pages and Marketing sections therefore top
// out identically; the only difference is whether there is a tab control in the
// middle.
//
// No description slot, matching PageBar. Explanatory paragraphs under a header
// are banned across the client app: they push the real content down and the
// title already says what the page is.
export function PageHeader({
  title,
  count,
  actions,
  filters,
  className,
}: {
  title: ReactNode;
  count?: ReactNode;
  actions?: ReactNode;
  filters?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 shrink-0", className)}>
      <div className="flex items-center gap-4 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-[var(--shadow-sm)]">
        <div className="flex min-w-0 flex-1 items-baseline gap-2.5">
          <h2 className="truncate font-display text-[16px] font-semibold leading-none tracking-[-0.01em] text-text">
            {title}
          </h2>
          {count != null && <span className="font-data text-[12px] text-faint tnum">{count}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          {actions}
          <GlobalControls />
        </div>
      </div>
      {filters && <div className="mt-4 flex flex-wrap items-center gap-2">{filters}</div>}
    </div>
  );
}
