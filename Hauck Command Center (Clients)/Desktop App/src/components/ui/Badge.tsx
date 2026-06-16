import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { toneClasses, toneDot, type Tone, type StatusMeta } from "@/lib/status";

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// A status pill with a leading dot — the canonical way to show a backend status.
export function StatusPill({ meta, className }: { meta: StatusMeta; className?: string }) {
  return (
    <Badge tone={meta.tone} className={className}>
      <span className={cn("h-1.5 w-1.5 rounded-full", toneDot[meta.tone])} aria-hidden />
      {meta.label}
    </Badge>
  );
}
