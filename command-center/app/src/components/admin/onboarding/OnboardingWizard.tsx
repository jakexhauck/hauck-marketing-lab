import { useMemo, useState } from "react";
import { X } from "lucide-react";
import DeleteDialog from "./DeleteDialog";
import { SubmissionSheet } from "./OnboardingSheet";
import { useIntakeAction, useIntakeQueue } from "../../../hooks/useIntake";

// New client (/admin/onboarding), the agency side of onboarding.
//
// Since the client strip (2026-10-05) a client's setup checklist lives inside
// their own sub-account (ClientOnboarding.tsx). What stays on the agency side
// is what has no sub-account yet: intake forms that never became a client.
// Opening one shows what they filled in; the X rejects it.

interface Row {
  key: string;
  name: string;
  sub: string;
  initials: string;
  color: string;
  submissionId: string;
}

export default function OnboardingWizard() {
  const forms = useIntakeQueue("all");
  const reject = useIntakeAction();

  const [selected, setSelected] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);

  const rows = useMemo<Row[]>(() => {
    // Only the forms that never became a client. A finished form creates the
    // client itself, so anything with a tenant already has a sub-account.
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

    return pending;
  }, [forms.data]);

  // The first row until one is picked, and again when the picked one leaves
  // the list (became a client, rejected).
  const current = rows.find((r) => r.key === selected) ?? rows[0] ?? null;

  if (forms.isLoading) {
    return <p className="mt-6 text-[13px] text-muted">Loading...</p>;
  }
  if (forms.isError) {
    return <p className="mt-6 text-[13px] text-danger">Forms did not load.</p>;
  }
  if (rows.length === 0) {
    return <p className="mt-6 text-[13px] text-muted">No open forms.</p>;
  }

  const confirmDelete = () => {
    if (!deleting) return;
    const done = { onSuccess: () => setDeleting(null) };
    reject.mutate({ id: deleting.submissionId, action: "reject" }, done);
  };
  const deleteError = reject.error as Error | null;

  return (
    <div className="mt-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      <nav
        aria-label="Open forms"
        className="flex flex-col gap-0.5 rounded-[var(--radius-lg)] border border-border bg-surface p-1.5 shadow-[var(--shadow-sm)] lg:sticky lg:top-4"
      >
        {rows.map((row) => {
          const on = row.key === current?.key;
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
                  <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-text">
                    <span className="truncate">{row.name}</span>
                  </span>
                  <span className="block truncate text-[11.5px] text-faint">{row.sub}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
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
        {current ? (
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
            <h2 className="px-5 py-4 font-display text-[17px] font-semibold text-text">{current.name}</h2>
            <SubmissionSheet submissionId={current.submissionId} />
          </div>
        ) : null}
      </div>

      {deleting && (
        <DeleteDialog
          name={deleting.name}
          pending={reject.isPending}
          error={deleteError ? deleteError.message || "That did not work." : null}
          onConfirm={confirmDelete}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
