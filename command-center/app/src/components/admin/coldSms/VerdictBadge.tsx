import type { ColdSmsVerdict } from "../../../lib/api";

// Claude's read of a cold SMS reply. Colour plus a word, never colour alone.
const LOOK: Record<ColdSmsVerdict, { label: string; color: string }> = {
  positive: { label: "Positive", color: "var(--positive)" },
  negative: { label: "Negative", color: "var(--danger)" },
  check: { label: "Check", color: "var(--warning)" },
  stop: { label: "Stop", color: "var(--text-faint)" },
};

export function VerdictBadge({ verdict }: { verdict: ColdSmsVerdict }) {
  const { label, color } = LOOK[verdict];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-bold tracking-wide"
      style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} aria-hidden />
      {label}
    </span>
  );
}
