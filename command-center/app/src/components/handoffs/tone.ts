import type { Tone } from "../../lib/handoffModel";

// Maps a status tone to Tailwind classes, so the list chips, the conversation
// header and any future surface all colour a status identically.
export const TONE_CHIP: Record<Tone, string> = {
  neutral: "bg-[var(--surface-2)] text-[var(--text-muted)]",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  brand: "bg-[var(--brand-tint)] text-[var(--brand-text)]",
  violet: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
  emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  danger: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400",
};

export const TONE_SOLID: Record<Tone, string> = {
  neutral: "bg-[var(--text-faint)]",
  amber: "bg-amber-500",
  brand: "bg-[var(--brand-primary)]",
  violet: "bg-violet-500",
  emerald: "bg-emerald-500",
  danger: "bg-rose-500",
};
