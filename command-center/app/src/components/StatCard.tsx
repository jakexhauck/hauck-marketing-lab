import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: ReactNode;
}

export default function StatCard({ label, value }: StatCardProps) {
  return (
    <div
      className="kpi-accent group flex flex-col gap-2 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3 shadow-[var(--shadow-sm)] transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[var(--shadow-lg)]"
      role="group"
      aria-label={label}
    >
      <div className="label-cap truncate">{label}</div>
      <div className="font-data text-2xl font-semibold text-[var(--text)]">{value}</div>
    </div>
  );
}
