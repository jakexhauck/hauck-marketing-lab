import { useState } from "react";
import { Plus } from "lucide-react";
import { useCreateLeadForm, useLeadFormsQuery } from "../../../../hooks/useApi";
import { ErrorNote, Spinner } from "../../../../routes/paid-ads/trackerShared";
import LeadFormCard from "./LeadFormCard";

// Paid Ads > Ad Builder > Forms (0090).
//
// Drafts of Meta Instant Forms, per client. A form lives here rather than
// inside a batch because one form usually serves several rounds: owning it from
// a round would mean rebuilding it each time and having edits to one never
// reach the other. A batch points at one instead.
//
// Nothing here reaches Meta. The output is text on a clipboard.

export default function LeadFormsPanel({ tenantId }: { tenantId: string }) {
  const query = useLeadFormsQuery(tenantId);
  const create = useCreateLeadForm(tenantId);
  const [openId, setOpenId] = useState<string | null>(null);

  const forms = query.data?.forms ?? [];

  const startForm = () => {
    create.mutate(undefined, { onSuccess: ({ form }) => setOpenId(form.id) });
  };

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

      {query.isError ? (
        <ErrorNote message={(query.error as Error | null)?.message} />
      ) : query.isLoading && !query.data ? (
        <Spinner />
      ) : forms.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-[13px] text-faint">
          No lead forms yet. Press New form to write one.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {forms.map((form) => (
            <LeadFormCard
              key={form.id}
              tenantId={tenantId}
              form={form}
              open={openId === form.id}
              onToggle={() => setOpenId(openId === form.id ? null : form.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
