import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn";

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
  stretch = false,
  className,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  // Fill the width with equal segments in the phone column, and fall back to
  // natural width at lg. A four-option control is ~275px, which fits the phone
  // column but leaves anything beside it to wrap onto a ragged second row; a
  // control that owns its row reads as a deliberate choice instead.
  stretch?: boolean;
  className?: string;
}) {
  const activeIndex = Math.max(
    0,
    options.findIndex((opt) => opt.value === value),
  );
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  // Measure the active button so the gradient pill aligns to its real geometry,
  // robust to variable label widths. Re-measures on active change and resize.
  useLayoutEffect(() => {
    const el = btnRefs.current[activeIndex];
    if (!el) return;
    const update = () => setPill({ left: el.offsetLeft, width: el.offsetWidth });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeIndex, options.length]);

  return (
    <div
      className={cn(
        "relative items-center rounded-full border border-border bg-surface-2 p-1",
        stretch ? "flex w-full lg:inline-flex lg:w-auto" : "inline-flex",
        className,
      )}
      role="tablist"
    >
      {/* Sliding gradient pill behind the active segment. */}
      {pill && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1 bottom-1 rounded-full shadow-brand"
          style={{
            left: pill.left,
            width: pill.width,
            backgroundImage: "var(--grad-brand)",
            transition: "left 0.32s var(--ease), width 0.32s var(--ease)",
          }}
        />
      )}
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative z-10 inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-colors",
              size === "sm" ? "h-7 px-3 text-[12.5px]" : "h-8 px-3.5 text-[13px]",
              // min-w-0 so equal segments can go narrower than their labels
              // rather than pushing the control past its container.
              stretch && "min-w-0 flex-1 lg:flex-none",
              active ? "text-white" : "text-muted hover:text-text",
            )}
          >
            {opt.label}
            {opt.count != null && (
              <span
                className={cn(
                  "font-data text-[11px]",
                  active ? "text-white/85" : "text-faint",
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
