import { Clock } from "lucide-react";
import { resolveStageProgress } from "../../lib/pipelineProgress";

// A read-only view of where a contact's opportunity sits in its pipeline. This
// page shows the stage; it never moves it (stage movement lives on the pipeline
// board). Inert by construction: no buttons, no drag, no click handlers.
export default function PipelineStepper({
  pipelineName,
  stages,
  currentStageId,
}: {
  pipelineName: string;
  stages: { id: string; name: string }[];
  currentStageId: string | null | undefined;
}) {
  if (stages.length === 0) return null;
  const steps = resolveStageProgress(stages, currentStageId);

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-[18px] shadow-[var(--shadow-sm)]">
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <span className="label-cap truncate">Pipeline · {pipelineName}</span>
        <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-[var(--text-faint)]">
          <Clock size={12} aria-hidden="true" />
          Read-only view
        </span>
      </div>

      <ol className="flex items-start">
        {steps.map((step, i) => {
          const reached = step.state === "done" || step.state === "current";
          return (
            <li
              key={step.id}
              className="relative flex flex-1 flex-col items-center gap-[7px]"
            >
              {/* connector bar behind the node (hidden on the first step) */}
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute left-[-50%] top-[6.5px] z-0 h-0.5 w-full"
                  style={{
                    background: reached
                      ? "var(--brand)"
                      : "var(--border-strong)",
                  }}
                />
              )}
              <span
                aria-hidden="true"
                className="z-[1] h-[15px] w-[15px] rounded-full border-2"
                style={{
                  background: reached ? "var(--brand)" : "var(--surface)",
                  borderColor: reached ? "var(--brand)" : "var(--border-strong)",
                  boxShadow:
                    step.state === "current"
                      ? "0 0 0 4px var(--brand-tint-strong)"
                      : undefined,
                }}
              />
              <span
                className="text-center text-[11px] font-semibold"
                style={{
                  color:
                    step.state === "current"
                      ? "var(--brand-text)"
                      : step.state === "done"
                        ? "var(--text-muted)"
                        : "var(--text-faint)",
                }}
              >
                {step.name}
                {step.state === "current" && (
                  <span className="sr-only"> (current stage)</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
