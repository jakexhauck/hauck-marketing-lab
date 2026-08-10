import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useCreateLeadForm, useDeleteLeadForm, useLeadFormsQuery } from "../../../../hooks/useApi";
import { ErrorNote, Spinner } from "../../../../routes/paid-ads/trackerShared";
import { INTENT_LABEL } from "../../../../../functions/lib/adLeadForms";
import { shortDate } from "./adBuilderShared";
import LeadFormEditor from "./LeadFormEditor";

// Paid Ads > Ad Builder > Lead Form (0090, rebuilt 0099).
//
// Drafts of Meta Instant Forms, per client. A form lives here rather than inside
// a round of ads because one form usually serves several: owning it from a round
// would mean rebuilding it each time and having edits to one never reach the
// other.
//
// Two states and no third: the LIST, and ONE FORM OPEN. A form is now the whole
// panel rather than an expanded card, because the editor is Meta's builder with
// a live preview beside it and that does not fit inside a row.
//
// Nothing here reaches Meta. The output is text on a clipboard.

export default function LeadFormsPanel({
  tenantId,
  clientName,
}: {
  tenantId: string;
  clientName: string;
}) {
  const query = useLeadFormsQuery(tenantId);
  const create = useCreateLeadForm(tenantId);
  const remove = useDeleteLeadForm(tenantId);
  const [openId, setOpenId] = useState<string | null>(null);

  const forms = query.data?.forms ?? [];
  const openForm = forms.find((f) => f.id === openId) ?? null;

  const startForm = () => {
    create.mutate(undefined, { onSuccess: ({ form }) => setOpenId(form.id) });
  };

  if (query.isError) return <ErrorNote message={(query.error as Error | null)?.message} />;
  if (query.isLoading && !query.data) return <Spinner />;

  // The list is not refetched under an open editor, so the row this was opened
  // from is the row it stays on. Keyed by id so switching forms remounts the
  // draft rather than pouring one form's answers into another's boxes.
  if (openForm) {
    return (
      <LeadFormEditor
        key={openForm.id}
        tenantId={tenantId}
        clientName={clientName}
        form={openForm}
        onClose={() => setOpenId(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={startForm}
          disabled={create.isPending}
          className="flex shrink-0 items-center gap-1.5 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-1.5 text-[12.5px] font-semibold text-text transition-colors hover:border-brand disabled:opacity-50"
        >
          <Plus size={14} />
          New form
        </button>
      </div>

      {create.isError && (
        <p className="text-[12.5px] text-danger">
          {(create.error as Error | null)?.message ?? "Could not start a form."}
        </p>
      )}

      {forms.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-[13px] text-faint">
          No lead forms yet. Press New form to write one.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {forms.map((form) => {
            const title = form.name.trim() || "Untitled form";
            const count = form.questions.length;
            return (
              <li
                key={form.id}
                className="flex items-center gap-2 overflow-hidden rounded-lg border border-border bg-surface pr-3"
              >
                <button
                  type="button"
                  onClick={() => setOpenId(form.id)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 px-4 py-3 text-left"
                >
                  <span className="truncate text-[13.5px] font-semibold text-text">{title}</span>
                  <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                    {count} {count === 1 ? "question" : "questions"}
                  </span>
                  <span className="shrink-0 text-[11.5px] text-faint">
                    {INTENT_LABEL[form.intent]}
                  </span>
                  <span className="ml-auto shrink-0 text-[11.5px] text-faint">
                    {shortDate(form.createdAt)}
                  </span>
                </button>

                <DeleteButton
                  title={title}
                  onDelete={() => remove.mutate({ formId: form.id })}
                  busy={remove.isPending}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Two presses, in place. A form is half an hour of thinking and there is no
// undo behind this, so the second press is the confirmation.
function DeleteButton({
  title,
  onDelete,
  busy,
}: {
  title: string;
  onDelete: () => void;
  busy: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Delete ${title}`}
        className="shrink-0 rounded-[var(--radius)] border border-border p-1.5 text-faint transition-colors hover:border-danger hover:text-danger"
      >
        <Trash2 size={14} aria-hidden />
      </button>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        className="text-[12px] font-semibold text-danger disabled:opacity-50"
      >
        Delete for good
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-[12px] font-medium text-muted hover:text-text"
      >
        Keep
      </button>
    </span>
  );
}
