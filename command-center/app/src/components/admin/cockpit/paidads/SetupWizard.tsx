import type { ReactNode } from "react";
import { Check } from "lucide-react";

// The shell both Paid Ads setup wizards wear: linking the ad account, and
// pointing Creatives at a Drive folder.
//
// Same shape on purpose. Both are the one thing standing between an operator
// and a working page, so both are the only thing on screen while they are
// unfinished, and both say which step of how many they are on. A setup step
// rendered as one card among several reads as optional, and gets skipped until
// a client asks why their dashboard is empty.

export interface WizardStepDef {
  id: string;
  label: string;
}

export default function SetupWizard({
  title,
  intro,
  steps,
  currentIndex = 0,
  children,
}: {
  title: string;
  /** Only when the title alone leaves the operator stuck. Default is none. */
  intro?: string;
  /** Omit to drop the step rail: the controls below already say where you are. */
  steps?: WizardStepDef[];
  /** Zero-based. Steps before it read as done, after it as still to come. */
  currentIndex?: number;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-sm)] sm:p-6">
        {steps && steps.length > 0 && (
        <ol className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-2">
          {steps.map((step, i) => {
            const done = i < currentIndex;
            const active = i === currentIndex;
            return (
              <li key={step.id} className="flex items-center gap-2">
                {i > 0 && <span className="mr-1 h-px w-5 bg-border" aria-hidden />}
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11.5px] font-semibold ${
                    done
                      ? "bg-positive text-white"
                      : active
                        ? "bg-brand text-brand-fg"
                        : "bg-surface-3 text-faint"
                  }`}
                  aria-hidden
                >
                  {done ? <Check size={12} /> : i + 1}
                </span>
                <span
                  className={`text-[12.5px] ${
                    active ? "font-semibold text-text" : done ? "text-muted" : "text-faint"
                  }`}
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
        )}

        <h2 className="font-display text-[17px] font-semibold text-text">{title}</h2>
        {intro && (
          <p className="mt-1 max-w-prose text-[13px] leading-snug text-muted">{intro}</p>
        )}

        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
