import { useState } from "react";
import { CheckCircle2, Copy as CopyIcon, FileText, Send } from "lucide-react";
import type { LeadForm } from "../../../../../functions/lib/adLeadForms";
import {
  useCreateInMeta,
  useDuplicateLeadForm,
  useMetaPage,
  useSetMetaPage,
  useSopTemplateForm,
} from "../../../../hooks/useSopApi";
import { SopButton, SopError } from "../../sop/sopKit";

// The strip under a lead form's title that takes it into Meta (2026-10-06).
//
//   Page        the client's Facebook Page, picked once per client
//   SOP template  fills an editable draft with the Client Setup SOP form
//   Create in Meta  builds it on the Page; the draft then locks
//   Duplicate   the next editable version of a form that is in Meta
//
// After Create, the parts Meta's API could not take are listed for setting by
// hand in Ads Manager (conditional questions, answers that close the form).

export default function LeadFormMetaBar({
  tenantId,
  form,
  onReplaced,
  onCreated,
  onDuplicated,
}: {
  tenantId: string;
  form: LeadForm;
  // The draft under the editor changed (SOP template): reseed it.
  onReplaced: (form: LeadForm) => void;
  // Now in Meta: lock the editor in place (no remount, so the list below stays).
  onCreated: () => void;
  onDuplicated: (form: LeadForm) => void;
}) {
  const page = useMetaPage(tenantId);
  const setPage = useSetMetaPage(tenantId);
  const create = useCreateInMeta(tenantId);
  const template = useSopTemplateForm(tenantId);
  const duplicate = useDuplicateLeadForm(tenantId);
  const [confirmTemplate, setConfirmTemplate] = useState(false);

  const inMeta = !!form.metaFormId || create.isSuccess;
  const pageId = page.data?.pageId ?? "";
  const pages = page.data?.pages ?? [];
  const manual = create.data?.manual ?? [];
  const hasContent = form.questions.length > 0 || form.introHeadline.trim() !== "";

  const runTemplate = () => {
    if (hasContent && !confirmTemplate) {
      setConfirmTemplate(true);
      return;
    }
    setConfirmTemplate(false);
    template.mutate(form.id, { onSuccess: ({ form: f }) => onReplaced(f) });
  };

  return (
    <div className="border-b border-border px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {inMeta ? (
          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-positive">
            <CheckCircle2 size={14} aria-hidden /> In Meta
          </span>
        ) : (
          <select
            value={pageId}
            onChange={(e) => setPage.mutate(e.target.value)}
            disabled={page.isLoading || setPage.isPending}
            aria-label="Facebook Page"
            className="max-w-[220px] rounded-[var(--radius)] border border-border bg-surface px-2 py-1.5 text-[12.5px] text-text"
          >
            <option value="">{page.isLoading ? "Loading Pages..." : "Pick the Facebook Page"}</option>
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}

        {!inMeta && (
          <SopButton onClick={runTemplate} disabled={template.isPending}>
            <FileText size={14} aria-hidden />
            {template.isPending ? "Filling..." : confirmTemplate ? "Replace this draft?" : "SOP template"}
          </SopButton>
        )}
        {confirmTemplate && !template.isPending && (
          <SopButton onClick={() => setConfirmTemplate(false)}>Cancel</SopButton>
        )}

        {!inMeta && (
          <SopButton
            primary
            onClick={() => create.mutate(form.id, { onSuccess: () => onCreated() })}
            disabled={create.isPending || !pageId}
            title={pageId ? undefined : "Pick the Facebook Page first"}
          >
            <Send size={14} aria-hidden /> {create.isPending ? "Creating..." : "Create in Meta"}
          </SopButton>
        )}

        {inMeta && (
          <SopButton
            onClick={() => duplicate.mutate(form.id, { onSuccess: ({ form: f }) => onDuplicated(f) })}
            disabled={duplicate.isPending}
          >
            <CopyIcon size={14} aria-hidden /> {duplicate.isPending ? "Duplicating..." : "Duplicate"}
          </SopButton>
        )}
      </div>

      {page.data?.pagesError && !inMeta && <p className="mt-1.5 text-[12px] text-danger">{page.data.pagesError}</p>}
      {template.data?.claude && <p className="mt-1.5 text-[12px] text-warning">Ticks are plain: {template.data.claude}</p>}
      {manual.length > 0 && (
        <div className="mt-2 rounded-[var(--radius)] border border-warning/40 bg-warning-tint px-3 py-2">
          <p className="text-[12px] font-semibold text-text">Set by hand in Ads Manager</p>
          <ul className="mt-1 list-disc pl-4 text-[12px] text-muted">
            {manual.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      <SopError error={setPage.error ?? template.error ?? create.error ?? duplicate.error} />
    </div>
  );
}
