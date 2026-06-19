import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

// The base surface unit of the cockpit: a bordered card with optional header.
export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]",
        className,
      )}
      {...props}
    />
  );
}

export function PanelHeader({
  title,
  kicker,
  action,
  className,
}: {
  title: ReactNode;
  kicker?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-divider px-4 py-3",
        className,
      )}
    >
      <div className="min-w-0">
        {kicker && <div className="label-cap mb-0.5">{kicker}</div>}
        <h3 className="truncate font-display text-[15px] text-text">{title}</h3>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
