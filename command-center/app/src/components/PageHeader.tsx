import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import GlobalControls from "./desktop/GlobalControls";

// The consistent header every desktop surface renders at the top of its scroll
// area: title + count on the left; on the right, the page's own actions followed
// by the global controls (search, agency chat, notifications, account menu). The
// global controls are desktop-only (lg+) — the phone keeps its own hero bell and
// bottom bar — so on phone this is just title + page actions.
export function PageHeader({
  title,
  count,
  description,
  actions,
  filters,
  className,
}: {
  title: ReactNode;
  count?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  filters?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2.5">
            <h2 className="font-display text-[22px] leading-none text-text">{title}</h2>
            {count != null && (
              <span className="font-data text-sm text-faint tnum">{count}</span>
            )}
          </div>
          {description && <p className="mt-1.5 text-sm text-muted">{description}</p>}
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
