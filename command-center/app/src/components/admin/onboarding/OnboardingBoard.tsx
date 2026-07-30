import { Clock, Send, Wrench } from "lucide-react";
import type { IntakeStatus, IntakeSubmissionSummary } from "../../../hooks/useIntake";

// The onboarding pipeline board.
//
// Deliberately not a roster. Fulfillment lists clients who are all equals, so a
// flat searchable list is right there. Onboarding is a conveyor belt: a client
// moves from filling in, to waiting on Jake, to being stood up. Here POSITION IS
// STATUS, so "who is stuck where" is legible without reading a single label.
//
// 'rejected' has no column on purpose. It is an end state, not a stage, and
// giving it equal weight would make the board look half full of failures.

export const STAGES: {
  key: IntakeStatus;
  label: string;
  hint: string;
  icon: typeof Clock;
}[] = [
  {
    key: "in_progress",
    label: "Filling in",
    hint: "The client has started but not finished.",
    icon: Clock,
  },
  {
    key: "submitted",
    label: "Waiting on you",
    hint: "Finished. Read it, then approve or reject.",
    icon: Send,
  },
  {
    key: "approved",
    label: "Being set up",
    hint: "Approved. Work the checklist, then Go Live.",
    icon: Wrench,
  },
];

export function groupByStage(
  submissions: IntakeSubmissionSummary[],
): Record<IntakeStatus, IntakeSubmissionSummary[]> {
  const out: Record<IntakeStatus, IntakeSubmissionSummary[]> = {
    in_progress: [],
    submitted: [],
    approved: [],
    rejected: [],
  };
  for (const s of submissions) out[s.status]?.push(s);
  return out;
}

// "3 days" beats a date here: this board is about how long someone has been
// waiting, not about precisely when they arrived.
export function ageLabel(iso: string, now: number = Date.now()): string {
  const days = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

export function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-[var(--brand)] transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-faint">{pct}%</span>
    </div>
  );
}

export default function OnboardingBoard({
  submissions,
  onSelect,
}: {
  submissions: IntakeSubmissionSummary[];
  onSelect: (id: string) => void;
}) {
  const grouped = groupByStage(submissions);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {STAGES.map((stage) => {
        const items = grouped[stage.key];
        const Icon = stage.icon;
        return (
          <section key={stage.key} className="flex min-w-0 flex-col">
            <header className="mb-3 border-t-2 border-border pt-2.5">
              <div className="flex items-center gap-2">
                <Icon size={14} className="text-faint" aria-hidden />
                <h2 className="text-[13px] font-semibold text-text">{stage.label}</h2>
                <span className="ml-auto text-[12px] tabular-nums text-faint">{items.length}</span>
              </div>
              <p className="mt-1 text-[12px] leading-snug text-faint">{stage.hint}</p>
            </header>

            <div className="flex flex-col gap-2">
              {items.length === 0 ? (
                <p className="rounded-[var(--radius)] border border-dashed border-border px-3 py-6 text-center text-[12px] text-faint">
                  Nothing here
                </p>
              ) : (
                items.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onSelect(s.id)}
                    className="flex flex-col gap-2 rounded-[var(--radius)] border border-border bg-surface px-3.5 py-3 text-left shadow-[var(--shadow-sm)] transition-colors hover:border-[var(--brand)]/50 hover:bg-surface-2"
                  >
                    <span className="truncate text-[14px] font-medium text-text">{s.name}</span>
                    <span className="truncate text-[12px] text-faint">
                      {[s.niche, s.contactName].filter(Boolean).join(" · ") || "No details yet"}
                    </span>
                    {/* The bar only earns its place where it means something. Past
                        the first column every submission is complete by
                        definition, so it would be decoration. */}
                    {stage.key === "in_progress" ? (
                      <ProgressBar pct={s.completeness} />
                    ) : (
                      <span className="text-[11px] text-faint">
                        {stage.key === "submitted" ? "Waiting " : "Since "}
                        {ageLabel(s.createdAt)}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
