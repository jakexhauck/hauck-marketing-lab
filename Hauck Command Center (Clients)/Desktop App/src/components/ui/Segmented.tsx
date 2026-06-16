import { cn } from "@/lib/cn";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

// A compact segmented control for filters/toggles (status filters, board/list).
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-[var(--radius)] border border-border bg-surface-2 p-0.5",
        className,
      )}
      role="tablist"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] font-medium transition-colors",
              size === "sm" ? "h-7 px-2.5 text-[12.5px]" : "h-8 px-3 text-[13px]",
              active
                ? "bg-surface text-text shadow-[var(--shadow-sm)]"
                : "text-muted hover:text-text",
            )}
          >
            {opt.label}
            {opt.count != null && (
              <span className={cn("font-data text-[11px]", active ? "text-brand-text" : "text-faint")}>
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
