import { cn } from "@/lib/cn";
import { initials, hashIndex } from "@/lib/format";

// Deterministic muted tints so a contact keeps the same color everywhere.
const TINTS = [
  "bg-[color-mix(in_srgb,var(--brand)_16%,transparent)] text-brand-text",
  "bg-positive-tint text-positive",
  "bg-warning-tint text-warning",
  "bg-[color-mix(in_srgb,#7c5cff_16%,transparent)] text-[#6d4ff0] dark:text-[#a899ff]",
  "bg-[color-mix(in_srgb,#1f9aa8_16%,transparent)] text-[#1a7d89] dark:text-[#5ed0db]",
];

const SIZES = { sm: "h-7 w-7 text-[11px]", md: "h-9 w-9 text-[13px]", lg: "h-11 w-11 text-[15px]" };

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string | null | undefined;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const tint = TINTS[hashIndex(name ?? "?", TINTS.length)];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none",
        SIZES[size],
        tint,
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
