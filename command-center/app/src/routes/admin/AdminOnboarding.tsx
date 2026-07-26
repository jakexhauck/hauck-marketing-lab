import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Check, Inbox, X } from "lucide-react";
import DesktopPage from "../../components/desktop/DesktopPage";
import { Button } from "../../components/ui/Button";
import {
  useIntakeAction,
  useIntakeQueue,
  useIntakeSubmission,
  type IntakeStatus,
  type IntakeSubmissionSummary,
} from "../../hooks/useIntake";
import { INTAKE_FIELDS, INTAKE_STEPS } from "../../lib/intake";

// The intake submissions queue (/admin/onboarding).
//
// The funnel at /onboarding is open to anyone, so nothing it produces becomes a
// client until it is approved here. That is the whole security model: a junk
// submission costs one row and is seen by nobody but Jake.
//
// This is also the route the five Onboarding pillar lanes have been linking to
// since before it existed.

const TABS: { key: IntakeStatus | "all"; label: string }[] = [
  { key: "submitted", label: "Waiting on you" },
  { key: "in_progress", label: "Still filling in" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

export default function AdminOnboarding() {
  const [tab, setTab] = useState<IntakeStatus | "all">("submitted");
  const [selected, setSelected] = useState<string | null>(null);

  const queue = useIntakeQueue(tab);
  const submissions = queue.data?.submissions ?? [];
  const counts = queue.data?.counts ?? {};

  return (
    <DesktopPage
      title="Onboarding"
      subtitle="Everything the client intake form has sent in. Nothing becomes a client until you approve it."
    >
      <div className="mt-5 flex flex-wrap items-center gap-1.5">
        {TABS.map((t) => {
          const count = t.key === "all" ? queue.data?.total : counts[t.key as IntakeStatus];
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTab(t.key);
                setSelected(null);
              }}
              className={[
                "rounded-[var(--radius)] border px-3 py-1.5 text-[13px] font-medium transition-colors",
                active
                  ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand-text)]"
                  : "border-border bg-surface text-muted hover:bg-surface-2 hover:text-text",
              ].join(" ")}
            >
              {t.label}
              {typeof count === "number" && count > 0 && (
                <span className="ml-1.5 text-[12px] opacity-70">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-2 shadow-[var(--shadow-sm)]">
          {queue.isError ? (
            <Empty icon={AlertTriangle}>Could not load submissions.</Empty>
          ) : queue.isLoading ? (
            <Empty icon={Inbox}>Loading...</Empty>
          ) : submissions.length === 0 ? (
            <Empty icon={Inbox}>
              {tab === "submitted"
                ? "Nothing waiting on you."
                : "Nothing here."}
            </Empty>
          ) : (
            <ul className="flex flex-col">
              {submissions.map((s) => (
                <QueueRow
                  key={s.id}
                  submission={s}
                  active={s.id === selected}
                  onSelect={() => setSelected(s.id)}
                />
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-6 shadow-[var(--shadow-sm)]">
          {selected ? (
            <Detail id={selected} onDone={() => setSelected(null)} />
          ) : (
            <Empty icon={Inbox}>Pick a submission to read it.</Empty>
          )}
        </section>
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

const STATUS_TONE: Record<IntakeStatus, string> = {
  submitted: "border-[var(--brand)]/40 bg-[var(--brand)]/10 text-[var(--brand-text)]",
  in_progress: "border-border bg-surface-2 text-muted",
  approved: "border-positive/40 bg-positive/10 text-positive",
  rejected: "border-border bg-surface-2 text-faint",
};

const STATUS_LABEL: Record<IntakeStatus, string> = {
  submitted: "Submitted",
  in_progress: "In progress",
  approved: "Approved",
  rejected: "Rejected",
};

function QueueRow({
  submission,
  active,
  onSelect,
}: {
  submission: IntakeSubmissionSummary;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={[
          "flex w-full flex-col gap-1.5 rounded-[var(--radius)] px-3.5 py-3 text-left transition-colors",
          active ? "bg-surface-2" : "hover:bg-surface-2",
        ].join(" ")}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[14px] font-medium text-text">{submission.name}</span>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[submission.status]}`}
          >
            {STATUS_LABEL[submission.status]}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 text-[12px] text-faint">
          <span className="truncate">
            {[submission.niche, submission.contactName].filter(Boolean).join(" · ") || "No details yet"}
          </span>
          <span className="shrink-0">{new Date(submission.createdAt).toLocaleDateString()}</span>
        </div>

        {/* Completeness counts required fields only, so a client who skipped the
            optional questions still reads as finished. */}
        <div className="flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-[var(--brand)] transition-[width]"
              style={{ width: `${submission.completeness}%` }}
            />
          </div>
          <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-faint">
            {submission.completeness}%
          </span>
        </div>
      </button>
    </li>
  );
}

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
