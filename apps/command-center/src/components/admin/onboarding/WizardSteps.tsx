import { Check } from "lucide-react";
import { cn } from "../../../lib/cn";

// The wizard's step header: a node per step, a connector bar that fills as you
// advance, and a click target on every node so you can jump straight back to a
// step you have already passed.
//
// Forked from components/contacts/PipelineStepper, which is inert by
// construction (it shows where a contact sits, it never moves them). This one is
// the opposite: navigation is the whole point. Sharing one component would have
// meant bolting optional click handlers onto something whose comment promises it
// has none, so it is a fork rather than a prop.

export interface WizardStepNode {
  n: number;
  label: string;
}

export default function WizardSteps({
  steps,
  current,
  furthest,
  onJump,
}: {
  steps: WizardStepNode[];
  current: number;
  // The highest step reached so far. Everything up to it is clickable; nothing
  // beyond it is, so you cannot skip validation by clicking ahead.
  furthest: number;
  onJump: (n: number) => void;
}) {
  const total = steps.length;
  const progress = total > 1 ? ((current - 1) / (total - 1)) * 100 : 0;

  return (
    <nav aria-label="Onboarding steps" className="mb-7">
      <div
        className="relative mb-4 h-1 w-full overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-valuetext={`Step ${current} of ${total}`}
      >
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>

      <ol className="flex items-start">
        {steps.map((step) => {
          const done = step.n < current;
          const active = step.n === current;
          const reachable = step.n <= furthest;

          return (
            <li key={step.n} className="flex flex-1 flex-col items-center gap-2">
              <button
                type="button"
                disabled={!reachable}
                aria-current={active ? "step" : undefined}
                onClick={() => onJump(step.n)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1 transition-colors",
                  reachable
                    ? "cursor-pointer hover:bg-surface-2"
                    : "cursor-not-allowed opacity-60",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full border-2 text-[12px] font-semibold transition-colors",
                    done && "border-brand bg-brand text-brand-fg",
                    active && "border-brand bg-surface text-brand-text",
                    !done && !active && "border-border-strong bg-surface text-faint",
                  )}
                  style={
                    active ? { boxShadow: "0 0 0 4px var(--brand-tint-strong)" } : undefined
                  }
                >
                  {done ? <Check size={14} strokeWidth={3} /> : step.n}
                </span>
                <span
                  className={cn(
                    "text-center text-[11px] font-semibold leading-tight",
                    active
                      ? "text-brand-text"
                      : done
                        ? "text-muted"
                        : "text-faint",
                  )}
                >
                  {step.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
