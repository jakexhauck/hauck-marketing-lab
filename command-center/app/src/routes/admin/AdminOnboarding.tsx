import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Inbox, X } from "lucide-react";
import DesktopPage from "../../components/desktop/DesktopPage";
import { Button } from "../../components/ui/Button";
import OnboardingBoard from "../../components/admin/onboarding/OnboardingBoard";
import { useIntakeAction, useIntakeQueue, useIntakeSubmission } from "../../hooks/useIntake";
import type { IntakeStatus } from "../../hooks/useIntake";
import { INTAKE_FIELDS, INTAKE_STEPS } from "../../lib/intake";

// The intake submissions surface (/admin/onboarding).
//
// The funnel at /onboarding is open to anyone, so nothing it produces becomes a
// client until it is approved here. That is the whole security model: a junk
// submission costs one row and is seen by nobody but Jake.
//
// This is also the route the five Onboarding pillar lanes have been linking to
// since before it existed.
//
// The layout is a pipeline board, chosen from three candidates. The first
// attempt was a list-and-detail split, which read as a clone of the Fulfillment
// roster; a roster is a filing cabinet of equals, whereas onboarding is a
// conveyor belt. See OnboardingBoard.tsx.

export default function AdminOnboarding() {
  const [selected, setSelected] = useState<string | null>(null);

  // One request, grouped in the browser. The stages are a view of the same
  // data, so refetching per column would be three round trips for one screen.
  const queue = useIntakeQueue("all");
  const live = (queue.data?.submissions ?? []).filter((s) => s.status !== "rejected");

  return (
    <DesktopPage
      title="Onboarding"
      subtitle="Every client we are standing up, and where each one has got to."
    >
      <div className="mt-6">
        {queue.isError ? (
          <Empty icon={AlertTriangle}>Could not load submissions.</Empty>
        ) : queue.isLoading ? (
          <Empty icon={Inbox}>Loading...</Empty>
        ) : selected ? (
          <>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-brand-text"
            >
              <ArrowLeft size={15} aria-hidden />
              Back to onboarding
            </button>
            <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-6 shadow-[var(--shadow-sm)]">
              <Detail id={selected} onDone={() => setSelected(null)} />
            </section>
          </>
        ) : live.length === 0 ? (
          <Empty icon={Inbox}>
            Nobody is being onboarded right now. Clients land here the moment they
            start the intake form.
          </Empty>
        ) : (
          <OnboardingBoard submissions={live} onSelect={setSelected} />
        )}
      </div>
    </DesktopPage>
  );
}

function Empty({
  icon: Icon,
  children,
}: {
  icon: typeof Inbox;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-14 text-center">
      <Icon size={20} className="text-faint" aria-hidden />
      <p className="text-[13px] text-muted">{children}</p>
    </div>
  );
}

// Stage colour moved onto the board columns, where position already carries the
// meaning. Only the wording is still needed here, for the detail header.
const STATUS_LABEL: Record<IntakeStatus, string> = {
  submitted: "Submitted",
  in_progress: "In progress",
  approved: "Approved",
  rejected: "Rejected",
};


function Detail({ id, onDone }: { id: string; onDone: () => void }) {
  const detail = useIntakeSubmission(id);
  const action = useIntakeAction();
  const [confirmReject, setConfirmReject] = useState(false);

  if (detail.isError) return <Empty icon={AlertTriangle}>Could not load this submission.</Empty>;
  if (detail.isLoading || !detail.data) return <Empty icon={Inbox}>Loading...</Empty>;

  const d = detail.data;
  const answers = d.answers ?? {};
  const result = action.data;

  function display(key: string): string | null {
    const field = INTAKE_FIELDS.find((f) => f.key === key);
    if (!field) return null;
    const raw = answers[key];
    if (field.type === "checkbox") return raw === true ? "Yes" : null;
    if (typeof raw !== "string" || !raw.trim()) return null;
    if (field.options) return field.options.find((o) => o.value === raw)?.label ?? raw;
    return raw;
  }

  return (
    <>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label-cap">{STATUS_LABEL[d.status]}</p>
          <h2 className="mt-1 truncate font-display text-[19px] font-semibold text-text">
            {(typeof answers.name === "string" && answers.name) || "Unnamed"}
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {d.loginEmail ?? "No login email chosen"} · {d.completeness}% complete
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Close
        </Button>
      </header>

      {result?.ownerWarning && (
        <Notice tone="warn">
          The client was created, but their login was not: {result.ownerWarning}. Add it by hand
          from the client's config.
        </Notice>
      )}

      {result?.status === "approved" && result.tenantId && (
        <Notice tone="ok">
          Client created and held at the setup screen. They can sign in, but the app stays closed
          to them until you press Go Live.{" "}
          <Link
            className="font-medium text-brand-text underline underline-offset-2"
            to={`/admin/onboarding/${result.tenantId}`}
          >
            Open their setup checklist
          </Link>
        </Notice>
      )}

      {action.isError && (
        <Notice tone="warn">{(action.error as Error)?.message ?? "That did not work."}</Notice>
      )}

      <div className="flex flex-col gap-5">
        {INTAKE_STEPS.map((step) => {
          const rows = INTAKE_FIELDS.filter((f) => f.step === step.n)
            .map((f) => ({ field: f, value: display(f.key) }))
            .filter((r) => r.value !== null);
          if (rows.length === 0) return null;

          return (
            <section key={step.n}>
              <h3 className="label-cap mb-2">{step.label}</h3>
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
            </section>
          );
        })}
      </div>

      <footer className="mt-7 border-t border-border pt-5">
        {d.tenantId ? (
          <Link to={`/admin/onboarding/${d.tenantId}`}>
            <Button variant="primary">
              Open their setup checklist
              <ArrowRight size={15} aria-hidden />
            </Button>
          </Link>
        ) : d.blocker ? (
          <p className="text-[13px] text-muted">{d.blocker}</p>
        ) : (
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              disabled={action.isPending}
              onClick={() => action.mutate({ id, action: "approve" })}
            >
              <Check size={15} aria-hidden />
              {action.isPending ? "Creating..." : "Approve and create client"}
            </Button>

            {confirmReject ? (
              <>
                <Button
                  variant="ghost"
                  disabled={action.isPending}
                  onClick={() => action.mutate({ id, action: "reject" })}
                >
                  <X size={15} aria-hidden />
                  Yes, reject
                </Button>
                <button
                  type="button"
                  className="text-[12px] text-faint hover:text-muted"
                  onClick={() => setConfirmReject(false)}
                >
                  Cancel
                </button>
              </>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmReject(true)}>
                Reject
              </Button>
            )}
          </div>
        )}
      </footer>
    </>
  );
}

function Notice({ tone, children }: { tone: "ok" | "warn"; children: React.ReactNode }) {
  const cls =
    tone === "ok"
      ? "border-positive/40 bg-positive/5 text-text"
      : "border-danger/40 bg-danger/5 text-text";
  return (
    <p className={`mb-5 rounded-[var(--radius)] border px-3.5 py-3 text-[13px] leading-snug ${cls}`}>
      {children}
    </p>
  );
}
