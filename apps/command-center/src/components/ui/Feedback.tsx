import type { ReactNode } from "react";
import { Loader2, Inbox, TriangleAlert } from "lucide-react";
import { cn } from "../../lib/cn";
import { Button } from "./Button";

export function Spinner({ className, size = 18 }: { className?: string; size?: number }) {
  return <Loader2 size={size} className={cn("animate-spin text-faint", className)} />;
}

// Shimmering placeholder block for loading states.
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-sm)] bg-surface-2",
        "bg-[linear-gradient(90deg,transparent,var(--surface-3),transparent)] bg-[length:480px_100%] bg-no-repeat",
        "animate-[shimmer_1.4s_infinite]",
        className,
      )}
    />
  );
}

export function LoadingState({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-16 text-faint", className)}>
      <Spinner size={22} />
      <span className="text-sm">{label}...</span>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-faint">
        {icon ?? <Inbox size={22} />}
      </div>
      <h3 className="font-display text-base text-text">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger-tint text-danger">
        <TriangleAlert size={22} />
      </div>
      <h3 className="font-display text-base text-text">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>}
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
