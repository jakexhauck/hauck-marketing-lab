import { useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Copy } from "lucide-react";
import {
  FORM_LIMITS,
  INTENT_LABEL,
  LEAD_FORM_INTENTS,
  formToText,
  type LeadForm,
  type LeadFormIntent,
  type LeadFormPatch,
  type LeadQuestion,
} from "../../../../../functions/lib/adLeadForms";
import { useDeleteLeadForm, useUpdateLeadForm } from "../../../../hooks/useApi";
import { BlockInput, LineInput, SectionLabel, shortDate } from "./adBuilderShared";
import LeadFormQuestions from "./LeadFormQuestions";

// One lead form draft, open for writing (0090).
//
// Laid out in Meta's own order: name, type, intro, questions, privacy,
// completion. Building the real form is then a walk down this card rather than
// a hunt for which box matches which.
//
// SAVING: no Save button, same contract as a batch card. Each block writes
// itself when it is left and only when it changed; structural edits inside the
// question list (add, remove, reorder, switch kind) write at once. The card
// holds the draft and the list query is never refetched under a live cursor.
//
// The point of the whole thing is Copy form, which renders the draft as plain
// text. That rendering lives in the shared module and is tested there, not here.

export default function LeadFormCard({
  tenantId,
  form,
  open,
  onToggle,
}: {
  tenantId: string;
  form: LeadForm;
  open: boolean;
  onToggle: () => void;
}) {
  const update = useUpdateLeadForm(tenantId);
  const remove = useDeleteLeadForm(tenantId);

  const [draft, setDraft] = useState<LeadForm>(form);
  const saved = useRef<LeadForm>(form);
  const [confirming, setConfirming] = useState(false);

  const save = (patch: LeadFormPatch, apply: (server: LeadForm) => void) => {
    update.mutate(
      { formId: form.id, patch },
      {
        onSuccess: ({ form: server }) => {
          saved.current = server;
          apply(server);
        },
      },
    );
  };

  // One helper per plain-text field: compare against what the server confirmed,
  // send only that key, and fold back what came back.
  const saveText = (key: keyof LeadFormPatch & keyof LeadForm) => () => {
    if (draft[key] === saved.current[key]) return;
    save({ [key]: draft[key] } as LeadFormPatch, (s) =>
      setDraft((d) => ({ ...d, [key]: s[key] })),
    );
  };

  const set = (key: keyof LeadForm) => (v: string) => setDraft((d) => ({ ...d, [key]: v }));

  const setIntent = (intent: LeadFormIntent) => {
    setDraft((d) => ({ ...d, intent }));
    save({ intent }, (s) => setDraft((d) => ({ ...d, intent: s.intent })));
  };

  const setQuestions = (questions: LeadQuestion[]) => setDraft((d) => ({ ...d, questions }));

  const saveQuestions = (next: LeadQuestion[]) => {
    if (JSON.stringify(next) === JSON.stringify(saved.current.questions)) return;
    save({ questions: next }, (s) => setDraft((d) => ({ ...d, questions: s.questions })));
  };

  const saveError = update.isError
    ? ((update.error as Error | null)?.message ?? "Could not save that.")
    : null;

  const title = draft.name.trim() || "Untitled form";
  const qCount = draft.questions.length;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-2 pr-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-3 text-left"
        >
          {open ? (
            <ChevronDown size={15} className="shrink-0 text-faint" />
          ) : (
            <ChevronRight size={15} className="shrink-0 text-faint" />
          )}
          <span className="truncate text-[13.5px] font-semibold text-text">{title}</span>
          <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted">
            {qCount} {qCount === 1 ? "question" : "questions"}
          </span>
          <span className="ml-auto shrink-0 text-[11.5px] text-faint">
            {shortDate(form.createdAt)}
          </span>
        </button>

        <CopyFormButton form={draft} />

        {confirming ? (
          <span className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => remove.mutate({ formId: form.id })}
              disabled={remove.isPending}
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
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Delete ${title}`}
            className="shrink-0 text-[12px] font-medium text-faint transition-colors hover:text-danger"
          >
            Delete
          </button>
        )}
      </div>

      {open && (
        <div className="flex flex-col gap-5 border-t border-border px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <SectionLabel>Form name</SectionLabel>
              <LineInput
                value={draft.name}
                onChange={set("name")}
                onBlur={saveText("name")}
                placeholder="Storm damage quote"
                maxLength={FORM_LIMITS.name}
                ariaLabel="Form name"
              />
            </div>
            <div>
              <SectionLabel>Intent</SectionLabel>
              <div className="flex gap-1">
                {LEAD_FORM_INTENTS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setIntent(k)}
                    aria-pressed={draft.intent === k}
                    className={
                      "rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors " +
                      (draft.intent === k
                        ? "bg-brand text-white"
                        : "bg-surface-2 text-muted hover:text-text")
                    }
                  >
                    {INTENT_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <SectionLabel>Intro</SectionLabel>
            <div className="flex flex-col gap-2">
              <LineInput
                value={draft.introHeadline}
                onChange={set("introHeadline")}
                onBlur={saveText("introHeadline")}
                placeholder="Get your free storm damage assessment"
                maxLength={FORM_LIMITS.introHeadline}
                ariaLabel="Intro headline"
              />
              <BlockInput
                value={draft.introDescription}
                onChange={set("introDescription")}
                onBlur={saveText("introDescription")}
                placeholder="One line per benefit reads best in Meta's list layout."
                maxLength={FORM_LIMITS.introDescription}
                ariaLabel="Intro description"
                rows={3}
              />
            </div>
          </div>

          <LeadFormQuestions
            questions={draft.questions}
            onChange={setQuestions}
            onCommit={saveQuestions}
          />

          <div>
            <SectionLabel>Privacy</SectionLabel>
            <div className="flex flex-col gap-2">
              <LineInput
                value={draft.privacyUrl}
                onChange={set("privacyUrl")}
                onBlur={saveText("privacyUrl")}
                placeholder="williswindows.com/privacy"
                maxLength={500}
                ariaLabel="Privacy policy URL"
              />
              <BlockInput
                value={draft.privacyDisclaimer}
                onChange={set("privacyDisclaimer")}
                onBlur={saveText("privacyDisclaimer")}
                placeholder="Your own disclaimer, if this offer needs one."
                maxLength={FORM_LIMITS.disclaimer}
                ariaLabel="Privacy disclaimer"
                rows={2}
              />
            </div>
          </div>

          <div>
            <SectionLabel>Completion</SectionLabel>
            <div className="flex flex-col gap-2">
              <LineInput
                value={draft.completionHeadline}
                onChange={set("completionHeadline")}
                onBlur={saveText("completionHeadline")}
                placeholder="Thanks, we will call within 24 hours"
                maxLength={FORM_LIMITS.completionHeadline}
                ariaLabel="Completion headline"
              />
              <BlockInput
                value={draft.completionBody}
                onChange={set("completionBody")}
                onBlur={saveText("completionBody")}
                placeholder="Anything they should do or expect next."
                maxLength={FORM_LIMITS.completionBody}
                ariaLabel="Completion body"
                rows={2}
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <LineInput
                  value={draft.completionCta}
                  onChange={set("completionCta")}
                  onBlur={saveText("completionCta")}
                  placeholder="View website"
                  maxLength={FORM_LIMITS.completionCta}
                  ariaLabel="Completion button text"
                />
                <LineInput
                  value={draft.completionUrl}
                  onChange={set("completionUrl")}
                  onBlur={saveText("completionUrl")}
                  placeholder="williswindows.com"
                  maxLength={500}
                  ariaLabel="Completion button URL"
                />
              </div>
            </div>
          </div>

          {saveError && (
            <p className="text-[12.5px] text-danger">
              {saveError} Your text is still on screen, try leaving the box again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// The whole draft as plain text. This is what the table exists to produce, so
// it sits on the row header and works whether the card is open or shut.
//
// Deliberately not a "copied!" toast: the button becomes a tick for a moment
// and goes back. A toast for something this frequent is noise.
function CopyFormButton({ form }: { form: LeadForm }) {
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  const copy = async () => {
    const text = formToText(form);
    try {
      // Can reject on an insecure origin or a denied permission, and a silent
      // no-op would read as the button being broken.
      await navigator.clipboard.writeText(text);
      setFailed(false);
      setDone(true);
      window.setTimeout(() => setDone(false), 1600);
    } catch {
      setFailed(true);
      window.setTimeout(() => setFailed(false), 2600);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${form.name.trim() || "this form"} as text`}
      className="flex shrink-0 items-center gap-1.5 rounded-[var(--radius)] border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] font-semibold text-text transition-colors hover:border-brand"
    >
      {done ? <Check size={13} className="text-success" /> : <Copy size={13} />}
      {failed ? "Could not copy" : done ? "Copied" : "Copy form"}
    </button>
  );
}
