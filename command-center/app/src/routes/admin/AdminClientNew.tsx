import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Info, RotateCcw, Smartphone } from "lucide-react";
import DesktopPage from "../../components/desktop/DesktopPage";
import { Button } from "../../components/ui/Button";
import WizardField from "../../components/admin/onboarding/WizardField";
import WizardSteps from "../../components/admin/onboarding/WizardSteps";
import {
  DEFAULT_VALUES,
  ONBOARDING_FIELDS,
  ONBOARDING_STEPS,
  deriveInitials,
  fieldsForStep,
  forRestore,
  isPristine,
  missingRequired,
  slugify,
  stripSensitive,
  validateStep,
  type DraftValues,
} from "../../lib/clientOnboarding";

// The new-client onboarding wizard (/admin/clients/new). Six steps then a
// review: steps 1-3 are the technical shell Jake fills in, steps 4-6 are the
// client intake questionnaire.
//
// NOTHING IS WIRED UP YET. There are no API calls in this file and the Create
// button is disabled on purpose. POST /api/admin/clients exists and would take
// the step 1-3 fields today, but the 16 intake answers have nowhere to go until
// they have columns, and a form that silently bins half of what you typed is
// worse than one that plainly says it is not finished. See
// docs/build-plans/client-onboarding-wizard.md.

const DRAFT_KEY = "hml.admin.newClient.draft";
const REVIEW_STEP = ONBOARDING_STEPS.length + 1;

const STEP_NODES = [
  ...ONBOARDING_STEPS.map((s) => ({ n: s.n, label: s.label })),
  { n: REVIEW_STEP, label: "Review" },
];

interface StoredDraft {
  savedAt: string;
  values: DraftValues;
}

function loadDraft(): StoredDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    if (!parsed || typeof parsed !== "object" || !parsed.values) return null;
    return parsed;
  } catch {
    // A corrupt draft is not worth an error state; start clean.
    return null;
  }
}

export default function AdminClientNew() {
  const [step, setStep] = useState(1);
  const [furthest, setFurthest] = useState(1);
  const [values, setValues] = useState<DraftValues>({ ...DEFAULT_VALUES });
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [restoredAt, setRestoredAt] = useState<string | null>(null);

  // Once either of these is edited by hand it stops tracking the business name.
  const touched = useRef<Set<string>>(new Set());
  // Skip the first save pass so restoring a draft does not immediately rewrite it.
  const hydrated = useRef(false);

  useEffect(() => {
    const draft = loadDraft();
    // An untouched draft is not worth announcing; restoring it would greet every
    // visit with a "restored" bar for a form nobody ever typed in.
    if (draft && !isPristine(draft.values)) {
      setValues((prev) => ({ ...prev, ...forRestore(draft.values) }));
      setRestoredAt(draft.savedAt);
      // A restored draft may have hand-edited derived fields; leave them alone.
      if (draft.values.subdomain) touched.current.add("subdomain");
      if (draft.values.brandInitials) touched.current.add("brandInitials");
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    const timer = setTimeout(() => {
      try {
        if (isPristine(values)) {
          localStorage.removeItem(DRAFT_KEY);
          return;
        }
        const payload: StoredDraft = {
          savedAt: new Date().toISOString(),
          values: stripSensitive(values),
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
      } catch {
        // A full or blocked localStorage should not break the form.
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [values]);

  const setValue = useCallback((key: string, value: string | boolean) => {
    if (key === "subdomain" || key === "brandInitials") touched.current.add(key);

    // Typing a business name fills subdomain and initials too, so their errors
    // have to clear alongside it. Otherwise the subdomain sits there populated
    // and still flagged red as "required". Worked out here rather than inside
    // the state updater, which must stay pure.
    const derived: DraftValues = {};
    if (key === "name" && typeof value === "string") {
      if (!touched.current.has("subdomain")) derived.subdomain = slugify(value);
      if (!touched.current.has("brandInitials")) {
        derived.brandInitials = deriveInitials(value);
      }
    }
    const cleared = [key, ...Object.keys(derived)];

    setValues((prev) => ({ ...prev, [key]: value, ...derived }));

    // Clear on touch; everything is re-validated on Continue anyway.
    setErrors((prev) => {
      if (!cleared.some((k) => prev[k])) return prev;
      const next = { ...prev };
      for (const k of cleared) delete next[k];
      return next;
    });
  }, []);

  const setFileList = useCallback((key: string, list: File[]) => {
    setFiles((prev) => ({ ...prev, [key]: list }));
  }, []);

  function goTo(n: number) {
    setStep(n);
    setFurthest((f) => Math.max(f, n));
    setErrors({});
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function next() {
    const result = validateStep(step, values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    goTo(step + 1);
  }

  function discardDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Nothing to do; the in-memory reset below is what matters.
    }
    touched.current = new Set();
    setValues({ ...DEFAULT_VALUES });
    setFiles({});
    setErrors({});
    setRestoredAt(null);
    goTo(1);
  }

  // Every required field still empty, across all six steps. Drives the review
  // screen's outstanding list.
  const outstanding = useMemo(
    () =>
      ONBOARDING_STEPS.flatMap((s) =>
        missingRequired(s.n, values).map((f) => ({ step: s.n, field: f })),
      ),
    [values],
  );

  const current = ONBOARDING_STEPS.find((s) => s.n === step);
  const onReview = step === REVIEW_STEP;

  return (
    <DesktopPage
      title="New client"
      subtitle="Stand up the account, then capture what we need from the client."
      actions={
        <Link to="/admin/delivery">
          <Button variant="ghost" size="sm">
            <ArrowLeft size={15} aria-hidden />
            Back to Fulfillment
          </Button>
        </Link>
      }
    >
      <div className="mt-6 w-full max-w-[860px]">
        {restoredAt && (
          <div className="mb-5 flex items-center gap-3 rounded-[var(--radius)] border border-border bg-surface-2 px-3.5 py-2.5 text-[13px] text-muted">
            <RotateCcw size={15} className="shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              Restored an unfinished draft from {new Date(restoredAt).toLocaleString()}. The
              owner login, GHL token and tax ID are never saved, so re-enter those.
            </span>
            <Button variant="ghost" size="sm" onClick={discardDraft}>
              Start over
            </Button>
          </div>
        )}

        <WizardSteps steps={STEP_NODES} current={step} furthest={furthest} onJump={goTo} />

        <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-6 shadow-[var(--shadow-sm)]">
          {onReview ? (
            <Review outstanding={outstanding} values={values} files={files} onJump={goTo} />
          ) : (
            <>
              <header className="mb-5">
                <p className="label-cap">
                  Step {step} of {ONBOARDING_STEPS.length}
                </p>
                <h2 className="mt-1 font-display text-[19px] font-semibold text-text">
                  {current?.label}
                </h2>
                <p className="mt-1 text-[13px] leading-snug text-muted">{current?.blurb}</p>
              </header>

              <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                {fieldsForStep(step).map((field) => (
                  <WizardField
                    key={field.key}
                    field={field}
                    value={values[field.key]}
                    files={files[field.key]}
                    error={errors[field.key]}
                    onChange={setValue}
                    onFiles={setFileList}
                  />
                ))}
              </div>

              {step === 5 && <LeadConnectorLinks />}
            </>
          )}

          <footer className="mt-7 flex items-center justify-between gap-3 border-t border-border pt-5">
            <Button variant="ghost" onClick={() => goTo(step - 1)} disabled={step === 1}>
              <ArrowLeft size={15} aria-hidden />
              Back
            </Button>

            {onReview ? (
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-faint">Not wired up yet</span>
                <Button variant="primary" disabled title="Saving is the next build">
                  Create client
                </Button>
              </div>
            ) : (
              <Button variant="primary" onClick={next}>
                Continue
                <ArrowRight size={15} aria-hidden />
              </Button>
            )}
          </footer>
        </section>
      </div>
    </DesktopPage>
  );
}

// The source questionnaire asks the client to install LeadConnector, so the
// store links belong beside the checkbox rather than in a separate SOP.
function LeadConnectorLinks() {
  const linkCls =
    "text-brand-text underline decoration-brand/40 underline-offset-2 hover:decoration-brand";
  return (
    <p className="mt-4 flex items-center gap-2 rounded-[var(--radius)] border border-border bg-surface-2 px-3.5 py-2.5 text-[13px] text-muted">
      <Smartphone size={15} className="shrink-0" aria-hidden />
      <span>
        Send them the app:{" "}
        <a
          className={linkCls}
          href="https://apps.apple.com/us/app/lead-connector/id1564302502"
          target="_blank"
          rel="noreferrer"
        >
          iPhone
        </a>{" "}
        or{" "}
        <a
          className={linkCls}
          href="https://play.google.com/store/apps/details?id=com.LeadConnector&hl=en_US"
          target="_blank"
          rel="noreferrer"
        >
          Android
        </a>
      </span>
    </p>
  );
}

function Review({
  outstanding,
  values,
  files,
  onJump,
}: {
  outstanding: { step: number; field: { key: string; label: string } }[];
  values: DraftValues;
  files: Record<string, File[]>;
  onJump: (n: number) => void;
}) {
  function display(key: string): string | null {
    const field = ONBOARDING_FIELDS.find((f) => f.key === key);
    if (!field) return null;

    if (field.type === "file") {
      const count = files[key]?.length ?? 0;
      return count === 0 ? null : count === 1 ? files[key][0].name : `${count} files`;
    }
    if (field.type === "checkbox") return values[key] === true ? "Yes" : null;

    const raw = values[key];
    if (typeof raw !== "string" || !raw.trim()) return null;
    if (field.type === "password") return "•".repeat(Math.min(raw.length, 12));
    if (field.options) {
      return field.options.find((o) => o.value === raw)?.label ?? raw;
    }
    return raw;
  }

  return (
    <>
      <header className="mb-5">
        <p className="label-cap">Review</p>
        <h2 className="mt-1 font-display text-[19px] font-semibold text-text">
          Everything you have entered
        </h2>
      </header>

      {outstanding.length > 0 && (
        <div className="mb-6 rounded-[var(--radius)] border border-danger/40 bg-danger/5 p-4">
          <p className="text-[13px] font-semibold text-danger">
            {outstanding.length} required {outstanding.length === 1 ? "field is" : "fields are"}{" "}
            still empty
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-2 gap-y-1.5">
            {outstanding.map(({ step: s, field }) => (
              <li key={field.key}>
                <button
                  type="button"
                  onClick={() => onJump(s)}
                  className="rounded-[var(--radius-sm)] border border-danger/30 bg-surface px-2 py-1 text-[12px] font-medium text-danger transition-colors hover:bg-danger/10"
                >
                  {field.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-5">
        {ONBOARDING_STEPS.map((s) => {
          const rows = fieldsForStep(s.n)
            .map((f) => ({ field: f, value: display(f.key) }))
            .filter((r) => r.value !== null);

          return (
            <section key={s.n}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h3 className="label-cap">{s.label}</h3>
                <button
                  type="button"
                  onClick={() => onJump(s.n)}
                  className="text-[12px] font-medium text-muted transition-colors hover:text-brand-text"
                >
                  Edit
                </button>
              </div>

              {rows.length === 0 ? (
                <p className="text-[13px] text-faint">Nothing entered.</p>
              ) : (
                <dl className="grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2">
                  {rows.map(({ field, value }) => (
                    <div key={field.key} className={field.wide ? "sm:col-span-2" : undefined}>
                      <dt className="text-[12px] text-faint">{field.label}</dt>
                      <dd className="whitespace-pre-wrap break-words text-[14px] text-text">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          );
        })}
      </div>

      <p className="mt-6 flex items-start gap-2 rounded-[var(--radius)] border border-border bg-surface-2 px-3.5 py-3 text-[13px] leading-snug text-muted">
        <Info size={15} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          This form does not save anything yet. Your answers are kept in this browser only, and
          the password, GHL token and tax ID are never written to that draft.
        </span>
      </p>
    </>
  );
}
