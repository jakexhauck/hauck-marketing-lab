import { ArrowLeft, ChevronRight, Clock, Inbox, Send, Wrench } from "lucide-react";
import type { IntakeStatus, IntakeSubmissionSummary } from "../../hooks/useIntake";

// Three layout directions for the onboarding surface, so Jake can pick one on
// localhost rather than from a description. THE TWO HE DOES NOT PICK GET
// DELETED, along with this file: variants are a decision aid, not a feature.
//
// The brief: it must stop reading like the Fulfillment roster. A roster is a
// filing cabinet, a flat list of clients who are all equals. Onboarding is a
// conveyor belt: a submission moves from filling-in, to waiting on Jake, to
// being stood up. All three directions drop the left rail that caused the
// resemblance, and each encodes movement differently.
//
//   A  Pipeline board   - spatial. Columns per stage; position IS status.
//   B  Arrivals feed    - chronological. Grouped by when it landed.
//   C  Triage           - singular. One submission at a time, act and advance.

export type VariantKey = "a" | "b" | "c";

export const VARIANTS: { key: VariantKey; label: string; blurb: string }[] = [
  { key: "a", label: "Pipeline board", blurb: "Columns per stage. Position is status." },
  { key: "b", label: "Arrivals feed", blurb: "Chronological, grouped by when it landed." },
  { key: "c", label: "Triage", blurb: "One at a time. Act, then advance." },
];

// The three stages a submission can sit in, in the order it moves through them.
// 'rejected' is deliberately not a stage: it is an end state, reached through a
// quiet toggle rather than given a column of its own.
export const STAGES: {
  key: IntakeStatus;
  label: string;
  hint: string;
  icon: typeof Inbox;
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

// "3 days" beats a date here: this screen is about how long someone has been
// waiting, not about when precisely they arrived.
export function ageLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

export function ProgressBar({ pct, muted }: { pct: number; muted?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full transition-[width] ${muted ? "bg-[var(--text-faint)]" : "bg-[var(--brand)]"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-faint">{pct}%</span>
    </div>
  );
}

export function BackBar({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-brand-text"
    >
      <ArrowLeft size={15} aria-hidden />
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// A. Pipeline board
// ---------------------------------------------------------------------------

export function PipelineBoard({
  grouped,
  onSelect,
}: {
  grouped: Record<IntakeStatus, IntakeSubmissionSummary[]>;
  onSelect: (id: string) => void;
}) {
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
                    {stage.key === "in_progress" ? (
                      <ProgressBar pct={s.completeness} muted />
                    ) : (
                      <span className="text-[11px] text-faint">Waiting {ageLabel(s.createdAt)}</span>
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

// ---------------------------------------------------------------------------
// B. Arrivals feed
// ---------------------------------------------------------------------------

const STAGE_BY_KEY = new Map(STAGES.map((s) => [s.key, s]));

function bucket(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days <= 7) return "This week";
  if (days <= 30) return "This month";
  return "Older";
}

export function ArrivalsFeed({
  submissions,
  onSelect,
}: {
  submissions: IntakeSubmissionSummary[];
  onSelect: (id: string) => void;
}) {
  const buckets: { label: string; items: IntakeSubmissionSummary[] }[] = [];
  for (const s of submissions) {
    const label = bucket(s.createdAt);
    const existing = buckets.find((b) => b.label === label);
    if (existing) existing.items.push(s);
    else buckets.push({ label, items: [s] });
  }

  return (
    <div className="flex flex-col gap-6">
      {buckets.map((b) => (
        <section key={b.label}>
          <h2 className="label-cap mb-2">{b.label}</h2>
          <ul className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
            {b.items.map((s, i) => {
              const stage = STAGE_BY_KEY.get(s.status);
              const Icon = stage?.icon ?? Inbox;
              return (
                <li key={s.id} className={i > 0 ? "border-t border-border" : undefined}>
                  <button
                    type="button"
                    onClick={() => onSelect(s.id)}
                    className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-surface-2"
                  >
                    <Icon size={16} className="shrink-0 text-faint" aria-hidden />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-text">{s.name}</p>
                      <p className="truncate text-[12px] text-faint">
                        {[s.niche, s.contactName].filter(Boolean).join(" · ") || "No details yet"}
                      </p>
                    </div>

                    <div className="hidden w-40 shrink-0 sm:block">
                      <ProgressBar pct={s.completeness} muted={s.status === "in_progress"} />
                    </div>

                    <span className="w-28 shrink-0 text-right text-[12px] text-muted">
                      {stage?.label ?? "Rejected"}
                    </span>

                    <ChevronRight size={15} className="shrink-0 text-faint" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// C. Triage
// ---------------------------------------------------------------------------

export function TriageStrip({
  submissions,
  selected,
  onSelect,
}: {
  submissions: IntakeSubmissionSummary[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
      {submissions.map((s) => {
        const active = s.id === selected;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            className={[
              "flex shrink-0 flex-col gap-1 rounded-[var(--radius)] border px-3.5 py-2.5 text-left transition-colors",
              active
                ? "border-[var(--brand)] bg-[var(--brand)]/10"
                : "border-border bg-surface hover:bg-surface-2",
            ].join(" ")}
          >
            <span
              className={`max-w-[180px] truncate text-[13px] font-medium ${active ? "text-[var(--brand-text)]" : "text-text"}`}
            >
              {s.name}
            </span>
            <span className="text-[11px] tabular-nums text-faint">
              {s.completeness}% · {ageLabel(s.createdAt)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
