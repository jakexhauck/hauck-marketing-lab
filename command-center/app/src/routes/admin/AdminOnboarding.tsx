import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowRight, Check, Inbox, X } from "lucide-react";
import DesktopPage from "../../components/desktop/DesktopPage";
import { Button } from "../../components/ui/Button";
import { useIntakeAction, useIntakeQueue, useIntakeSubmission } from "../../hooks/useIntake";
import type { IntakeStatus } from "../../hooks/useIntake";
import { INTAKE_FIELDS, INTAKE_STEPS } from "../../lib/intake";
import {
  ArrivalsFeed,
  BackBar,
  PipelineBoard,
  TriageStrip,
  VARIANTS,
  groupByStage,
  type VariantKey,
} from "./onboardingVariants";

// The intake submissions surface (/admin/onboarding).
//
// The funnel at /onboarding is open to anyone, so nothing it produces becomes a
// client until it is approved here. That is the whole security model: a junk
// submission costs one row and is seen by nobody but Jake.
//
// This is also the route the five Onboarding pillar lanes have been linking to
// since before it existed.
//
// LAYOUT IS UNDER REVIEW. Three directions render behind ?v=a|b|c while Jake
// picks one. The first attempt used a list-and-detail split, which read as a
// clone of the Fulfillment roster: a roster is a filing cabinet of equals,
// whereas onboarding is a conveyor belt. All three replacements encode movement
// instead. Once Jake picks, the other two and onboardingVariants.tsx are
// deleted.

export default function AdminOnboarding() {
  const [params, setParams] = useSearchParams();
  const variant = (params.get("v") as VariantKey) ?? "a";
  const [selected, setSelected] = useState<string | null>(null);

  // One request, grouped in the browser. The stages are a view of the same
  // data, so refetching per column would be three round trips for one screen.
  const queue = useIntakeQueue("all");
  const all = queue.data?.submissions ?? [];
  const live = all.filter((s) => s.status !== "rejected");
  const grouped = groupByStage(live);

  function chooseVariant(key: VariantKey) {
    params.set("v", key);
    setParams(params, { replace: true });
    setSelected(null);
  }

  return (
    <DesktopPage
      title="Onboarding"
      subtitle="Every client we are standing up, and where each one has got to."
    >
      <VariantPicker current={variant} onPick={chooseVariant} />

      {queue.isError ? (
        <Empty icon={AlertTriangle}>Could not load submissions.</Empty>
      ) : queue.isLoading ? (
        <Empty icon={Inbox}>Loading...</Empty>
      ) : live.length === 0 ? (
        <Empty icon={Inbox}>
          Nobody is being onboarded right now. Submissions land here the moment a
          client finishes the intake form.
        </Empty>
      ) : selected && variant !== "c" ? (
        <>
          <BackBar onBack={() => setSelected(null)} label="Back to onboarding" />
          <Panel>
            <Detail id={selected} onDone={() => setSelected(null)} />
          </Panel>
        </>
      ) : variant === "a" ? (
        <PipelineBoard grouped={grouped} onSelect={setSelected} />
      ) : variant === "b" ? (
        <ArrivalsFeed submissions={live} onSelect={setSelected} />
      ) : (
        <>
          <TriageStrip submissions={live} selected={selected} onSelect={setSelected} />
          <Panel>
            {selected ? (
              <Detail id={selected} onDone={() => setSelected(null)} />
            ) : (
              <Empty icon={Inbox}>Pick a client above to work through them.</Empty>
            )}
          </Panel>
        </>
      )}
    </DesktopPage>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-6 shadow-[var(--shadow-sm)]">
      {children}
    </section>
  );
}

// Temporary, and labelled as such so nobody mistakes it for a feature.
function VariantPicker({
  current,
  onPick,
}: {
  current: VariantKey;
  onPick: (key: VariantKey) => void;
}) {
  return (
    <div className="mb-5 mt-5 flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-dashed border-border bg-surface-2 px-3.5 py-2.5">
      <span className="text-[12px] font-medium text-faint">Layout options (pick one):</span>
      {VARIANTS.map((v) => (
        <button
          key={v.key}
          type="button"
          onClick={() => onPick(v.key)}
          title={v.blurb}
          className={[
            "rounded-[var(--radius-sm)] border px-2.5 py-1 text-[12px] font-medium transition-colors",
            current === v.key
              ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand-text)]"
              : "border-border bg-surface text-muted hover:text-text",
          ].join(" ")}
        >
          {v.label}
        </button>
      ))}
    </div>
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
