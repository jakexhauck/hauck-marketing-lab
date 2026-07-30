import { useMemo } from "react";
import { Check, Megaphone, Rocket, Workflow } from "lucide-react";
import { Button } from "../../ui/Button";
import {
  useAdminOnboardingChecklistQuery,
  useAdminOnboardingChecklistToggle,
  useAdminOnboardingGoLive,
  useAdminOnboardingQuery,
  useAdminOnboardingReadinessQuery,
} from "../../../hooks/useApi";
import { useSetupSteps } from "../../../hooks/useSetupSteps";
import {
  READINESS_CODES,
  SETUP_SECTIONS,
  blockingSteps,
  groupSteps,
  sectionProgress,
  type SetupSection,
  type SetupStepRow,
} from "../../../lib/setupSteps";

// The two checkbox sections of Client setup: GoHighLevel, then Meta ads.
//
// The steps are rows now, edited on Onboarding > Management, so this file draws
// whatever the process currently says rather than a list baked into it.
//
// Three steps tick themselves from the live GoHighLevel checks. They are matched
// on `code`, never on their name, so renaming one in Management keeps its wiring.

const SECTION_ICON: Record<SetupSection, typeof Workflow> = {
  ghl: Workflow,
  ads: Megaphone,
};

export default function SetupSteps({ tenantId }: { tenantId: string }) {
  const stepsQuery = useSetupSteps();
  const record = useAdminOnboardingQuery(tenantId);
  const checklist = useAdminOnboardingChecklistQuery(tenantId);
  const readiness = useAdminOnboardingReadinessQuery(tenantId);
  const toggle = useAdminOnboardingChecklistToggle(tenantId);
  const goLive = useAdminOnboardingGoLive(tenantId);

  const steps = useMemo(() => stepsQuery.data?.steps ?? [], [stepsQuery.data]);
  const checks = readiness.data?.checks ?? [];

  // Which steps are done: saved ticks, plus the three the live checks answer.
  const doneIds = useMemo(() => {
    const saved = new Set(
      (checklist.data?.items ?? []).filter((i) => i.done).map((i) => i.task_key),
    );
    const byCode = new Map(steps.filter((s) => s.code).map((s) => [s.code as string, s.id]));
    for (const check of checks) {
      const code = READINESS_CODES[check.key];
      const id = code ? byCode.get(code) : undefined;
      if (!id) continue;
      if (check.ok) saved.add(id);
      else saved.delete(id);
    }
    return saved;
  }, [checklist.data, checks, steps]);

  const blocking = blockingSteps(steps, doneIds);
  const status = record.data?.onboardingStatus ?? "live";

  if (stepsQuery.data?.needsMigration) {
    return (
      <section className="rounded-[var(--radius-lg)] border border-danger/40 bg-danger/5 p-5">
        <p className="text-[13.5px] font-semibold text-text">The steps table does not exist yet.</p>
        <p className="mt-1 text-[13px] leading-snug text-muted">
          Run <code className="font-mono text-[12px]">0072_setup_steps.sql</code>, then this fills
          in with the process and becomes editable from Management.
        </p>
      </section>
    );
  }

  return (
    <>
      {SETUP_SECTIONS.map((section) => {
        const progress = sectionProgress(steps, section.id, doneIds);
        const Icon = SECTION_ICON[section.id];
        const groups = groupSteps(steps, section.id);

        return (
          <section
            key={section.id}
            className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-sm)] sm:p-6"
          >
            <header className="mb-4 flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius)] bg-brand-tint text-brand-text"
                  aria-hidden
                >
                  <Icon size={16} />
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-[16.5px] font-semibold text-text">
                    {section.label}
                  </h2>
                  <p className="mt-0.5 text-[13px] leading-snug text-muted">{section.blurb}</p>
                </div>
              </div>
              <span
                className={`shrink-0 text-[12.5px] font-semibold ${
                  progress.total > 0 && progress.done === progress.total
                    ? "text-positive"
                    : "text-faint"
                }`}
              >
                {progress.done}/{progress.total}
              </span>
            </header>

            {stepsQuery.isLoading ? (
              <p className="text-[13px] text-muted">Loading the steps...</p>
            ) : groups.length === 0 ? (
              <p className="text-[13px] text-muted">
                No steps in this section yet. Add them on Management.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {groups.map((group, i) => (
                  <div key={`${group.label ?? "none"}-${i}`}>
                    {group.label && <p className="label-cap mb-2">{group.label}</p>}
                    <ul className="flex flex-col gap-2">
                      {group.steps.map((step) => (
                        <li key={step.id}>
                          <StepRow
                            step={step}
                            done={doneIds.has(step.id)}
                            busy={toggle.isPending}
                            onToggle={(next) =>
                              toggle.mutate({ taskKey: step.id, done: next })
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}

      {status === "setup" && (
        <GoLive
          blocking={blocking.length}
          pending={goLive.isPending}
          error={goLive.error instanceof Error ? goLive.error.message : null}
          onGoLive={() => goLive.mutate()}
        />
      )}
    </>
  );
}

function StepRow({
  step,
  done,
  busy,
  onToggle,
}: {
  step: SetupStepRow;
  done: boolean;
  busy: boolean;
  onToggle: (next: boolean) => void;
}) {
  const auto = Boolean(step.code);
  return (
    <button
      type="button"
      disabled={auto || busy}
      aria-pressed={done}
      onClick={() => onToggle(!done)}
      className={[
        "flex w-full items-start gap-3 rounded-[var(--radius)] border px-3.5 py-3 text-left transition-colors",
        done ? "border-transparent bg-positive/8" : "border-border bg-surface hover:border-brand",
        auto ? "cursor-default" : "",
      ].join(" ")}
    >
      <span
        className={[
          "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border",
          done ? "border-positive bg-positive text-white" : "border-border text-transparent",
        ].join(" ")}
        aria-hidden
      >
        <Check size={13} />
      </span>

      <span className="min-w-0 flex-1">
        <span className={`block text-[13.5px] text-text ${done ? "font-semibold" : ""}`}>
          {step.label}
        </span>
        {step.note && (
          <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{step.note}</span>
        )}
      </span>

      {auto && (
        <span className="shrink-0 rounded-full bg-brand-tint px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-text">
          Auto
        </span>
      )}
      {!step.required && !auto && (
        <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-faint">
          Optional
        </span>
      )}
    </button>
  );
}

function GoLive({
  blocking,
  pending,
  error,
  onGoLive,
}: {
  blocking: number;
  pending: boolean;
  error: string | null;
  onGoLive: () => void;
}) {
  const ready = blocking === 0;
  return (
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-sm)] sm:p-6">
      <div className="min-w-0">
        <h3 className="font-display text-[16px] font-semibold text-text">
          They are waiting on you
        </h3>
        <p className="mt-0.5 text-[13px] leading-snug text-muted">
          They can sign in, but the app stays closed to them until you open it.
        </p>
        {error && <p className="mt-2 text-[12.5px] font-medium text-danger">{error}</p>}
      </div>

      <div className="flex flex-col items-end gap-1.5">
        <Button variant="primary" disabled={!ready} loading={pending} onClick={onGoLive}>
          <Rocket size={15} aria-hidden />
          {pending ? "Opening..." : "Go live"}
        </Button>
        <span className="text-[12px] text-faint">
          {ready
            ? "Opens their app straight away."
            : `${blocking} step${blocking === 1 ? "" : "s"} still needed.`}
        </span>
      </div>
    </section>
  );
}
