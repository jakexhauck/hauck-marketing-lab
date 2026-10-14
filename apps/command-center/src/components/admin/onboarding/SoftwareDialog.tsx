import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "../../ui/Button";
import { useAdminOnboardingSoftwareSubmit } from "../../../hooks/useApi";
import type { AdminOnboardingListItem } from "../../../lib/api";
import {
  BUNDLES,
  DIALERS,
  bundleLabel,
  dialerLabel,
  isBundle,
  isDialer,
  type Bundle,
  type Dialer,
} from "../../../lib/onboardingWizard";

// Software setup, a pop-up over the Onboarding page (Jake picked it from three
// mockups on 2026-09-23). Bundle, then who dials, then Review with Submit.
// Submit is how Jake knows the software has gone live: it stamps the date and
// ticks Software Account Made.
//
// Reopened after a submit it starts at Review, since the likely reason to open
// it again is to change one answer, and Change jumps straight to it.

const STEPS = ["Bundle", "Who dials", "Review"] as const;

export default function SoftwareDialog({
  client,
  onClose,
}: {
  client: AdminOnboardingListItem;
  onClose: () => void;
}) {
  const submit = useAdminOnboardingSoftwareSubmit(client.id);
  const [bundle, setBundle] = useState<Bundle | null>(isBundle(client.bundle) ? client.bundle : null);
  const [dialer, setDialer] = useState<Dialer | null>(isDialer(client.dialer) ? client.dialer : null);
  const [step, setStep] = useState(client.softwareLiveAt && bundle && dialer ? 2 : 0);
  const done = submit.isSuccess;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canNext = (step === 0 && bundle) || (step === 1 && dialer);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="software-title"
        className="grid w-full max-w-[500px] gap-5 rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-lg)]"
      >
        <div className="flex items-center gap-2.5">
          <span
            className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-sm)] font-display text-[10.5px] font-bold text-white"
            style={{ background: client.brandColor || "var(--brand)" }}
            aria-hidden
          >
            {client.brandInitials || client.name.slice(0, 2).toUpperCase()}
          </span>
          <h2 id="software-title" className="flex-1 font-display text-[16px] font-semibold text-text">
            Software setup
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] text-muted hover:bg-surface-2 hover:text-text"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        {done ? (
          <div className="py-3 text-center">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-positive-tint">
              <Check size={26} strokeWidth={2.6} className="text-positive" aria-hidden />
            </div>
            <h3 className="font-display text-[18px] font-semibold text-text">Software live</h3>
            <p className="mt-1 text-[13px] text-muted">
              {bundleLabel(bundle)} · {dialerLabel(dialer)}
            </p>
          </div>
        ) : (
          <>
            <ol className="flex gap-2" aria-label="Steps">
              {STEPS.map((label, i) => (
                <li key={label} className="flex-1" aria-current={i === step ? "step" : undefined}>
                  <span
                    className={
                      "block h-1 rounded-full transition-colors " +
                      (i <= step ? "bg-brand" : "bg-surface-3")
                    }
                  />
                  <span
                    className={
                      "mt-1.5 block text-[12px] font-medium " + (i === step ? "text-text" : "text-faint")
                    }
                  >
                    {label}
                  </span>
                </li>
              ))}
            </ol>

            {step === 0 && (
              <Choices
                title="Bundle"
                options={BUNDLES}
                value={bundle}
                onPick={(v) => setBundle(v)}
              />
            )}
            {step === 1 && (
              <Choices
                title="Who dials"
                options={DIALERS}
                value={dialer}
                onPick={(v) => setDialer(v)}
              />
            )}
            {step === 2 && (
              <div>
                <h3 className="mb-2 font-display text-[18px] font-semibold text-text">Review</h3>
                <ReviewRow label="Bundle" value={bundleLabel(bundle)} onChange={() => setStep(0)} />
                <ReviewRow label="Who dials" value={dialerLabel(dialer)} onChange={() => setStep(1)} />
                {submit.isError && (
                  <p className="mt-3 text-[12px] font-medium text-danger">
                    {(submit.error as Error)?.message || "That did not save."}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        <div className="flex items-center justify-between gap-2">
          {done ? (
            <span />
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setStep(step - 1)}
              className={step === 0 ? "invisible" : undefined}
            >
              Back
            </Button>
          )}
          {done ? (
            <Button variant="primary" size="sm" onClick={onClose}>
              Done
            </Button>
          ) : step === 2 ? (
            <Button
              variant="primary"
              size="sm"
              loading={submit.isPending}
              disabled={!bundle || !dialer}
              onClick={() => bundle && dialer && submit.mutate({ bundle, dialer })}
            >
              Submit
            </Button>
          ) : (
            <Button variant="primary" size="sm" disabled={!canNext} onClick={() => setStep(step + 1)}>
              Next
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Choices<T extends string>({
  title,
  options,
  value,
  onPick,
}: {
  title: string;
  options: { value: T; label: string }[];
  value: T | null;
  onPick: (v: T) => void;
}) {
  return (
    <div>
      <h3 className="mb-3 font-display text-[18px] font-semibold text-text">{title}</h3>
      <div role="radiogroup" aria-label={title} className="grid gap-2.5">
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onPick(o.value)}
              className={
                "flex items-center gap-3 rounded-[var(--radius)] border px-4 py-3.5 text-left transition-colors " +
                (on ? "border-brand bg-brand-tint" : "border-border bg-surface-2 hover:border-border-strong")
              }
            >
              <span
                className={
                  "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-[1.5px] " +
                  (on ? "border-brand" : "border-border-strong")
                }
              >
                {on && <span className="h-2 w-2 rounded-full bg-brand" />}
              </span>
              <span className="font-display text-[15px] font-semibold text-text">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ReviewRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-divider py-3 text-[14px]">
      <span className="text-faint">{label}</span>
      <span className="flex items-center gap-2.5 font-medium text-text">
        {value}
        <button
          type="button"
          onClick={onChange}
          className="text-[12.5px] font-medium text-brand-text hover:underline"
        >
          Change
        </button>
      </span>
    </div>
  );
}
