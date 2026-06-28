import { Zap } from "lucide-react";
import type { Automation, AutomationStatus } from "../../lib/automations";
import SequenceFlow from "./SequenceFlow";

const STATUS: Record<AutomationStatus, { label: string; color: string; bg: string }> = {
  active: { label: "Active", color: "#16a34a", bg: "rgba(22,163,74,0.12)" },
  scheduled: { label: "Scheduled", color: "#2563eb", bg: "rgba(37,99,235,0.12)" },
  paused: { label: "Paused", color: "var(--text-faint)", bg: "var(--surface-2)" },
};

function StatusPill({ status }: { status: AutomationStatus }) {
  const meta = STATUS[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ color: meta.color, background: meta.bg }}
    >
      <span className="relative flex h-1.5 w-1.5">
        {status === "active" && (
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 motion-reduce:hidden"
            style={{ background: meta.color }}
          />
        )}
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
      </span>
      {meta.label}
    </span>
  );
}

// One automation, read-only: header (name, status, trigger, live count) over the
// sequence flow. When `wave` is passed (a reactivation campaign) a list-progress
// footer shows how far through the audience the wave has reached.
export default function AutomationCard({
  automation,
  wave,
}: {
  automation: Automation;
  wave?: { audience: string; listSize: number; contacted: number };
}) {
  const pct = wave && wave.listSize > 0 ? Math.round((wave.contacted / wave.listSize) * 100) : 0;

  return (
    <section className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)] transition-shadow duration-200 hover:shadow-[var(--shadow-lg)]">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-divider px-6 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="font-display text-[16px] font-semibold text-text">{automation.name}</h3>
            <StatusPill status={automation.status} />
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-muted">
            <Zap size={13} className="shrink-0 text-brand-text" aria-hidden="true" />
            {automation.trigger}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-data text-[20px] font-semibold leading-none text-text tnum">
            {automation.enrolled.toLocaleString()}
          </div>
          <div className="label-cap mt-1">{wave ? "in this wave" : "enrolled now"}</div>
        </div>
      </div>

      <div className="px-6">
        <SequenceFlow steps={automation.steps} />
      </div>

      {wave && (
        <div className="border-t border-divider px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[12px]">
            <span className="text-muted">{wave.audience}</span>
            <span className="font-data text-text tnum">
              {wave.contacted.toLocaleString()} / {wave.listSize.toLocaleString()} reached · {pct}%
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div
              className="h-full rounded-full"
              style={{ width: `${pct}%`, background: "var(--grad-brand)" }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
