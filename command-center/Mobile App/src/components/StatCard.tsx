import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: ReactNode;
}

export default function StatCard({ label, value }: StatCardProps) {
  return (
    <div
      className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3"
      role="group"
      aria-label={label}
    >
      <div className="label-cap truncate">{label}</div>
      <div className="stat-num text-2xl">{value}</div>
    </div>
  );
}
