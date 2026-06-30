import { ORIGIN_BY_KEY, type OriginKey } from "../../lib/inboxFilters";

// The colored "where they came from" pill. Functional swatch color (from
// ORIGINS) tinted for the fill; this is the one place non-token color is ok.
export default function SourceBadge({
  origin,
  size = "md",
}: {
  origin: OriginKey;
  size?: "sm" | "md";
}) {
  const meta = ORIGIN_BY_KEY[origin] ?? ORIGIN_BY_KEY.other;
  const pad =
    size === "sm" ? "px-1.5 py-0.5 text-[9.5px]" : "px-2 py-0.5 text-[10.5px]";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${pad}`}
      style={{
        background: `color-mix(in srgb, ${meta.swatch} 14%, transparent)`,
        color: meta.swatch,
      }}
    >
      <span aria-hidden>{meta.icon}</span>
      {meta.label}
    </span>
  );
}
