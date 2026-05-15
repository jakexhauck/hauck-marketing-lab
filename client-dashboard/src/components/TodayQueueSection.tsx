import type { ReactNode } from "react";

interface Props {
  icon: ReactNode;
  title: string;
  count: number;
  children: ReactNode;
}

export default function TodayQueueSection({
  icon,
  title,
  count,
  children,
}: Props) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[var(--text-muted)]">
          {icon}
          <span className="label-cap-strong">{title}</span>
        </div>
        <span className="tabular-figs inline-flex min-w-[28px] items-center justify-center rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-bold text-[var(--text)]">
          {count}
        </span>
      </header>
      {children}
    </section>
  );
}
