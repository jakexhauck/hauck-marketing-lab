import { useState } from "react";
import { ChevronRight, ClipboardList } from "lucide-react";
import IntakeAnswerList from "./IntakeAnswerList";
import { useAdminOnboardingQuery } from "../../../hooks/useApi";
import { INTAKE_KEYS, intakeAnswered } from "../../../lib/onboarding";

// What the client told us, in their own words.
//
// The answers land in `onboarding.intake` when the funnel form submits (it
// approves itself now, see functions/api/intake/index.ts), and until this card
// went back on the page there was nowhere in the app to read them. The old card
// lived under record/ with the retired pipeline board and was styled in that
// board's `onb-*` CSS, which this page does not carry; this is the same content
// in the language the rest of Onboarding speaks.
//
// Read-only, and that is the point. These are the answers the client typed in
// themselves; editing them here would quietly replace what they said with what
// we remember them saying, and the record would stop being evidence. Anything
// that needs correcting for our own use is a setup value, edited on Management.

export default function IntakeAnswersCard({ tenantId }: { tenantId: string }) {
  const record = useAdminOnboardingQuery(tenantId);
  const [open, setOpen] = useState(true);

  const intake = record.data?.intake ?? {};
  const answered = intakeAnswered(intake);

  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-sm)] sm:p-6">
      <header className="flex items-start justify-between gap-4">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          <span
            className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius)] bg-brand-tint text-brand-text"
            aria-hidden
          >
            <ClipboardList size={16} />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-[16.5px] font-semibold text-text">
              What the client told us
            </span>
            <span className="mt-0.5 block text-[13px] leading-snug text-muted">
              Their own answers, straight from the intake form.
            </span>
          </span>
        </button>

        <span className="flex shrink-0 items-center gap-2">
          <span className="text-[12.5px] font-semibold tabular-nums text-faint">
            {answered}/{INTAKE_KEYS.length}
          </span>
          <ChevronRight
            size={16}
            aria-hidden
            className={`text-faint transition-transform ${open ? "rotate-90" : ""}`}
          />
        </span>
      </header>

      {open && (
        <div className="mt-4">
          {record.isLoading ? (
            <p className="text-[13px] text-muted">Loading their answers...</p>
          ) : record.isError ? (
            <p className="text-[13px] text-danger">Could not load their answers.</p>
          ) : answered === 0 ? (
            <p className="text-[13px] text-muted">
              Nothing from the intake form for this client. A client added by hand has no
              answers; one who filled the form in has them here. Submissions still being typed
              are on the Submissions tab.
            </p>
          ) : (
            <IntakeAnswerList answers={intake} />
          )}
        </div>
      )}
    </section>
  );
}
