import type { ReactNode } from "react";
import { cn } from "../lib/cn";

// The consistent header every desktop surface renders at the top of its scroll
// area: title + count on the left, primary actions on the right, optional
// filter row beneath.
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2.5">
            <h2 className="font-display text-[22px] leading-none text-text">{title}</h2>
            {count != null && (
              <span className="font-data text-sm text-faint tnum">{count}</span>
            )}
          </div>
          {description && <p className="mt-1.5 text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {filters && <div className="mt-4 flex flex-wrap items-center gap-2">{filters}</div>}
    </div>
  );
}
