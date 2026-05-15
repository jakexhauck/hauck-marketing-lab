import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: ReactNode;
  secondary?: string;
  accent?: "brand" | "default";
}

export default function StatCard({
  label,
  value,
  secondary,
  accent = "default",
}: StatCardProps) {
  const numberStyle =
    accent === "brand" ? { color: "var(--brand-primary)" } : undefined;
  return (
    <div
      className="flex min-h-[110px] min-w-[140px] shrink-0 snap-start flex-col justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3"
      role="group"
      aria-label={label}
    >
      <div
        className="text-2xl font-semibold tabular-nums text-slate-900"
        style={numberStyle}
      >
        {value}
      </div>
      <div className="mt-2 flex flex-col">
        <span className="text-xs font-medium text-slate-700">{label}</span>
        {secondary && (
          <span className="text-[11px] text-slate-500">{secondary}</span>
        )}
      </div>
    </div>
  );
}
