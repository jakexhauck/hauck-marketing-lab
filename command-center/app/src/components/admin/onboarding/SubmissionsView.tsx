import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronRight, Copy, Eye, EyeOff, Inbox } from "lucide-react";
import IntakeAnswerList from "./IntakeAnswerList";
import { Button } from "../../ui/Button";
import {
  useIntakeAction,
  useIntakeQueue,
  useIntakeSubmission,
  type IntakeStatus,
  type IntakeSubmissionSummary,
} from "../../../hooks/useIntake";
import { REVIEW_STEP } from "../../../lib/intake";
import { clientSetupPath } from "../../../lib/onboardingViews";

// Every intake form the funnel has taken.
//
// The funnel approves itself on submit, so this is not a queue of things to
// action. It is the record: what arrived, who is halfway through typing one
// right now, and which finished forms never became a client because the
// automatic approval failed. Between the board being retired and this view,
// none of that was visible anywhere in the app.
//
// Answers are only fetched for the row you open. The list endpoint deliberately
// summarises, so a tax ID is not shipped to the browser until it is asked for.

const FILTERS: { id: IntakeStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "submitted", label: "Finished" },
  { id: "in_progress", label: "Still typing" },
  { id: "approved", label: "Became a client" },
  { id: "rejected", label: "Dismissed" },
];

const STATUS_LABEL: Record<IntakeStatus, string> = {
  in_progress: "Still typing",
  submitted: "Finished",
  approved: "Became a client",
  rejected: "Dismissed",
};

// Finished but with no client is the one state that wants attention, so it is
// the one state that is not grey.
const STATUS_TONE: Record<IntakeStatus, string> = {
  in_progress: "bg-surface-2 text-muted",
  submitted: "bg-warning/12 text-warning",
  approved: "bg-positive/12 text-positive",
  rejected: "bg-surface-2 text-faint",
};

export default function SubmissionsView() {
  const [filter, setFilter] = useState<IntakeStatus | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const queue = useIntakeQueue(filter);

  const submissions = queue.data?.submissions ?? [];
  const counts = queue.data?.counts ?? {};
  const stranded = submissions.filter((s) => s.status === "submitted" && !s.tenantId).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const n = f.id === "all" ? undefined : (counts[f.id] ?? 0);
          const active = f.id === filter;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={[
                "rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                active
                  ? "border-transparent bg-brand-tint text-brand-text"
                  : "border-border text-muted hover:border-brand",
              ].join(" ")}
            >
              {f.label}
              {n !== undefined && <span className="ml-1.5 tabular-nums text-faint">{n}</span>}
            </button>
          );
        })}
      </div>

      {stranded > 0 && (
        <p className="rounded-[var(--radius)] border border-warning/40 bg-warning/8 px-4 py-3 text-[13px] leading-snug text-text">
          <b className="font-semibold">
            {stranded} finished {stranded === 1 ? "form has" : "forms have"} no client.
          </b>{" "}
          Submitting is meant to create one on the spot, so this means the automatic step did
          not run or did not finish. Open the row and press Create the client.
        </p>
      )}

      <section className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
        {queue.isLoading ? (
          <p className="p-5 text-[13px] text-muted">Loading the submissions...</p>
        ) : queue.isError ? (
          <p className="p-5 text-[13px] text-danger">Could not load the submissions.</p>
        ) : submissions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <Inbox size={22} className="text-faint" aria-hidden />
            <p className="text-[13.5px] font-semibold text-text">Nothing here</p>
            <p className="max-w-[46ch] text-[13px] leading-snug text-muted">
              {filter === "all"
                ? "No one has opened the intake form yet. Send someone the link from Add a client."
                : "No submissions in this state."}
            </p>
          </div>
        ) : (
          <ul>
            {submissions.map((s) => (
              <li key={s.id} className="border-b border-border last:border-b-0">
                <Row
                  submission={s}
                  open={openId === s.id}
                  onToggle={() => setOpenId((cur) => (cur === s.id ? null : s.id))}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Row({
  submission,
  open,
  onToggle,
}: {
  submission: IntakeSubmissionSummary;
  open: boolean;
  onToggle: () => void;
}) {
  const who = [submission.contactName, submission.loginEmail].filter(Boolean).join(" · ");

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-surface-2"
      >
        <ChevronRight
          size={15}
          aria-hidden
          className={`shrink-0 text-faint transition-transform ${open ? "rotate-90" : ""}`}
        />

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold text-text">
            {submission.name}
            {submission.niche && (
              <span className="ml-2 font-normal text-faint">{submission.niche}</span>
            )}
          </span>
          {who && <span className="mt-0.5 block truncate text-[12.5px] text-muted">{who}</span>}
        </span>

        <span className="hidden shrink-0 text-[12px] tabular-nums text-faint sm:block">
          Step {Math.min(submission.furthestStep, REVIEW_STEP)} of {REVIEW_STEP} ·{" "}
          {submission.completeness}%
        </span>

        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_TONE[submission.status]}`}
        >
          {STATUS_LABEL[submission.status]}
        </span>

        <span className="hidden w-[92px] shrink-0 text-right text-[12px] text-faint md:block">
          {when(submission.submittedAt ?? submission.createdAt)}
        </span>
      </button>

      {open && <Detail submission={submission} />}
    </>
  );
}

function Detail({ submission }: { submission: IntakeSubmissionSummary }) {
  const detail = useIntakeSubmission(submission.id);
  const action = useIntakeAction();
  const [confirming, setConfirming] = useState(false);

  const data = detail.data;
  const canCreate = Boolean(data && !data.tenantId && !data.blocker);
  const error = action.error instanceof Error ? action.error.message : null;

  return (
    <div className="border-t border-border bg-surface-2/40 px-5 py-4">
      {detail.isLoading ? (
        <p className="text-[13px] text-muted">Loading their answers...</p>
      ) : detail.isError || !data ? (
        <p className="text-[13px] text-danger">Could not load this submission.</p>
      ) : (
        <>
          <LoginCard email={data.loginEmail} password={data.password} hasPassword={data.hasPassword} />

          <IntakeAnswerList answers={data.answers} />

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-muted">
              {data.tenantId ? (
                <>
                  This one is a client.{" "}
                  <Link
                    to={clientSetupPath(data.tenantId)}
                    className="font-semibold text-brand-text underline underline-offset-2"
                  >
                    Open their setup
                  </Link>
                  .
                </>
              ) : data.blocker ? (
                data.blocker
              ) : confirming ? (
                "This creates a real client and a real login they can sign in with straight away."
              ) : (
                "Creating the client is what submitting was meant to do. It is safe to press: they land behind the holding screen until you press Go live."
              )}
            </p>

            {canCreate && (
              <span className="flex shrink-0 items-center gap-2">
                {confirming ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      loading={action.isPending}
                      onClick={() => {
                        setConfirming(false);
                        action.mutate({ id: submission.id, action: "approve" });
                      }}
                    >
                      Yes, create them
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={action.isPending}
                      onClick={() => action.mutate({ id: submission.id, action: "reject" })}
                    >
                      Dismiss
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => setConfirming(true)}>
                      Create the client
                    </Button>
                  </>
                )}
              </span>
            )}
          </div>

          {error && <p className="mt-2 text-[12.5px] font-semibold text-danger">{error}</p>}
          {action.data?.ownerWarning && (
            <p className="mt-2 text-[12.5px] font-semibold text-warning">
              {action.data.ownerWarning}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// What they will sign in with: the email, and the password as they typed it.
//
// Hidden behind a Show button rather than printed on open. Not security (the
// value is already in the browser by the time this renders) but shoulder
// safety: this panel gets opened on shared screens, and a password should not
// be sitting in the open every time somebody reads a submission.
//
// Null password with hasPassword true means they chose one before the app
// started keeping it. Nothing can recover that, so the card says so and points
// at the fix instead of showing an empty box.
function LoginCard({
  email,
  password,
  hasPassword,
}: {
  email: string | null;
  password: string | null;
  hasPassword: boolean;
}) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = (): void => {
    if (!password) return;
    void navigator.clipboard.writeText(password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div className="mb-4 rounded-[var(--radius)] border border-border bg-surface px-4 py-3">
      <p className="label-cap mb-2">Their login</p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="min-w-0">
          <span className="block text-[11.5px] text-faint">Email</span>
          <span className="block truncate text-[13.5px] text-text">{email ?? "Not chosen yet"}</span>
        </span>

        <span className="min-w-0">
          <span className="block text-[11.5px] text-faint">Password</span>
          {password ? (
            <span className="flex items-center gap-2">
              <span className="font-mono text-[13.5px] text-text">
                {shown ? password : "•".repeat(Math.min(password.length, 14))}
              </span>
              <button
                type="button"
                onClick={() => setShown((v) => !v)}
                aria-label={shown ? "Hide the password" : "Show the password"}
                className="text-faint transition-colors hover:text-text"
              >
                {shown ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button
                type="button"
                onClick={copy}
                aria-label="Copy the password"
                className="text-faint transition-colors hover:text-text"
              >
                {copied ? <Check size={14} className="text-positive" /> : <Copy size={14} />}
              </button>
            </span>
          ) : (
            <span className="block text-[13px] text-muted">
              {hasPassword
                ? "Chosen before the app kept these, so it cannot be shown. Set them a new one in the client's Team card."
                : "Not chosen yet. They have not reached the login step."}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

// Short and absolute. "3 days ago" reads well and answers the wrong question:
// what Jake needs from this column is which day a form landed.
function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
