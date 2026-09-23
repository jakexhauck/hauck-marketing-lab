import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { subtitle } from "./AccountRow";
import ClientWizard, { type WizardView } from "./ClientWizard";
import DeleteDialog from "./DeleteDialog";
import { SubmissionSheet } from "./OnboardingSheet";
import { useAdminOnboardingListQuery, useAdminOnboardingRemove } from "../../../hooks/useApi";
import { useIntakeAction, useIntakeQueue } from "../../../hooks/useIntake";
import { useSetupSteps } from "../../../hooks/useSetupSteps";
import { clientProgress, pct } from "../../../lib/onboardingWizard";
import type { AdminOnboardingListItem } from "../../../lib/api";

// Onboarding (/admin/onboarding), redesigned 2026-09-23.
//
// Everyone being stood up down the left, with how far along they are. Pick one
// and their whole setup checklist opens on the right, in whichever view is
// chosen at the top of the page.
//
// Clients in setup and forms that never became a client share the list, as
// before. A form has no checklist (there is no account to set up), so opening
// one shows what they filled in.
//
// The X on a row deletes it from Onboarding: a client's record is wiped and
// they are marked 'removed' (account untouched, see remove.ts); a form is
// rejected.

interface Row {
  key: string;
  name: string;
  sub: string;
  initials: string;
  color: string;
  client?: AdminOnboardingListItem;
  submissionId?: string;
}

export default function OnboardingWizard({ view }: { view: WizardView }) {
  const roster = useAdminOnboardingListQuery();
  const forms = useIntakeQueue("all");
  const steps = useSetupSteps();
  const remove = useAdminOnboardingRemove();
  const reject = useIntakeAction();

  const [selected, setSelected] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);

  const stepList = useMemo(() => steps.data?.steps ?? [], [steps.data]);

  const rows = useMemo<Row[]>(() => {
    const clients: Row[] = (roster.data?.clients ?? [])
      .filter((c) => c.onboardingStatus === "setup")
      .map((c) => ({
        key: `client:${c.id}`,
        name: c.name,
        sub: subtitle(c.niche, c.city, c.region) || c.slug,
        initials: c.brandInitials || c.name.slice(0, 2).toUpperCase(),
        color: c.brandColor || "var(--brand)",
        client: c,
      }));

    // Only the forms that never became a client. A finished form creates the
    // client itself, so anything with a tenant is already a row above.
    const pending: Row[] = (forms.data?.submissions ?? [])
      .filter((s) => !s.tenantId && s.status !== "rejected")
      .map((s) => ({
        key: `form:${s.id}`,
        name: s.name,
        sub: s.niche || s.contactName || "Form, no account",
        initials: s.name.slice(0, 2).toUpperCase(),
        color: "var(--surface-3)",
        submissionId: s.id,
      }));

    return [...clients, ...pending];
  }, [roster.data, forms.data]);

  // The first row until one is picked, and again when the picked one leaves
  // the list (gone live, deleted).
  const current = rows.find((r) => r.key === selected) ?? rows[0] ?? null;

  if (roster.isLoading || steps.isLoading) {
    return <p className="mt-6 text-[13px] text-muted">Loading...</p>;
  }
  if (roster.isError || steps.isError) {
    return <p className="mt-6 text-[13px] text-danger">Onboarding did not load.</p>;
  }
  if (rows.length === 0) {
    return <p className="mt-6 text-[13px] text-muted">Nobody is being set up.</p>;
  }

  const confirmDelete = () => {
    if (!deleting) return;
    const done = { onSuccess: () => setDeleting(null) };
    if (deleting.client) remove.mutate(deleting.client.id, done);
    else if (deleting.submissionId) reject.mutate({ id: deleting.submissionId, action: "reject" }, done);
  };
  const deleteError = (remove.error ?? reject.error) as Error | null;

  return (
    <div className="mt-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      <nav
        aria-label="Clients in setup"
        className="flex flex-col gap-0.5 rounded-[var(--radius-lg)] border border-border bg-surface p-1.5 shadow-[var(--shadow-sm)] lg:sticky lg:top-4"
      >
        {rows.map((row) => {
          const on = row.key === current?.key;
          const progress = row.client
            ? pct(clientProgress(stepList, new Set(row.client.doneKeys), row.client.bundle, row.client.dialer))
            : null;
          return (
            <div key={row.key} className="group relative">
              <button
                type="button"
                onClick={() => setSelected(row.key)}
                aria-current={on ? "true" : undefined}
                className={
                  "flex w-full items-center gap-2.5 rounded-[var(--radius)] p-2.5 pr-11 text-left transition-colors " +
                  (on ? "bg-surface-3" : "hover:bg-surface-2")
                }
              >
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)] font-display text-[11px] font-bold text-white"
                  style={{ background: row.color }}
                  aria-hidden
                >
                  {row.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-text">{row.name}</span>
                  {progress === null ? (
                    <span className="block truncate text-[11.5px] text-faint">{row.sub}</span>
                  ) : (
                    <span className="mt-1.5 block h-[5px] overflow-hidden rounded-full bg-surface-3">
                      <span
                        className="block h-full rounded-full bg-brand transition-[width] duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </span>
                  )}
                </span>
              </button>
              {progress !== null && (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11.5px] tabular-nums text-faint transition-opacity group-hover:opacity-0 group-focus-within:opacity-0 [@media(hover:none)]:opacity-0">
                  {progress}%
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  remove.reset();
                  reject.reset();
                  setDeleting(row);
                }}
                aria-label={`Delete ${row.name}`}
                className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-[var(--radius-sm)] bg-surface-3 text-faint opacity-0 transition-opacity hover:bg-danger/15 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
              >
                <X size={14} aria-hidden />
              </button>
            </div>
          );
        })}
      </nav>

      <div className="min-w-0">
        {current?.client ? (
          <ClientWizard
            // Keyed so Stepper starts back at Setup, and Scroll re-derives which
            // pillars are open, whenever a different client is picked.
            key={current.client.id}
            client={current.client}
            subtitle={current.sub}
            steps={stepList}
            view={view}
          />
        ) : current?.submissionId ? (
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
            <h2 className="px-5 py-4 font-display text-[17px] font-semibold text-text">{current.name}</h2>
            <SubmissionSheet submissionId={current.submissionId} />
          </div>
        ) : null}
      </div>

      {deleting && (
        <DeleteDialog
          name={deleting.name}
          pending={remove.isPending || reject.isPending}
          error={deleteError ? deleteError.message || "That did not work." : null}
          onConfirm={confirmDelete}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
