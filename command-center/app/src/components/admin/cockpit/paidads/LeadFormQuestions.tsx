import { useRef, useState } from "react";
import { ChevronDown, ChevronUp, CornerDownRight, Plus, X } from "lucide-react";
import {
  FORM_LIMITS,
  KIND_LABEL,
  META_QUESTION_GUIDE,
  PREFILL_GROUPS,
  defaultFieldName,
  type LeadQuestion,
  type LeadQuestionKind,
} from "../../../../../functions/lib/adLeadForms";
import {
  childrenOf,
  insertFollowUp,
  moveQuestion,
  nextQuestionId,
  removeSubtree,
  topLevel,
  treeOrder,
} from "../../../../lib/leadFormTree";
import { cn } from "../../../../lib/cn";
import { LineInput, SectionLabel, Toggle } from "./adBuilderShared";

// The question list inside a lead form draft (0090, rebuilt 0099).
//
// Meta's builder, drawn the way Meta draws it. Five kinds, because Meta has
// five, and branching shown as what it actually is: a follow-up hanging off ONE
// ANSWER of a multiple choice, nested under that answer rather than listed
// below the form with a rule dangling off the end.
//
// THE LIST IS STILL FLAT. `showIf` is the only thing stored; the nesting on
// screen is computed by leadFormTree.ts. That is what lets a question be moved,
// re-pointed or deleted without rewriting a tree, and it is why moving a
// question takes its follow-ups with it: a rule may only point BACKWARDS, so a
// parent dragged below its own follow-up would have that rule dropped on save.

const CUSTOM_KINDS: LeadQuestionKind[] = ["short", "choice", "appointment", "store_locator"];

function blankQuestion(questions: LeadQuestion[], fields: Partial<LeadQuestion>): LeadQuestion {
  return {
    id: nextQuestionId(questions),
    kind: "short",
    label: "",
    fieldName: "",
    prefill: "",
    optional: false,
    multiSelect: false,
    minLength: 0,
    maxLength: 0,
    inlineContext: "",
    options: [],
    showIf: null,
    ...fields,
  };
}

export default function LeadFormQuestions({
  questions,
  onChange,
  onCommit,
}: {
  questions: LeadQuestion[];
  onChange: (qs: LeadQuestion[]) => void;
  onCommit: (qs: LeadQuestion[]) => void;
}) {
  // Structural edits save at once. They are clicks with a visible result, and
  // waiting for a blur that may never come is how one gets lost.
  const commit = (next: LeadQuestion[]) => {
    onChange(next);
    onCommit(next);
  };

  const patch = (id: string, fields: Partial<LeadQuestion>) => {
    onChange(questions.map((q) => (q.id === id ? { ...q, ...fields } : q)));
  };

  const patchNow = (id: string, fields: Partial<LeadQuestion>) => {
    commit(questions.map((q) => (q.id === id ? { ...q, ...fields } : q)));
  };

  const add = (fields: Partial<LeadQuestion>) => {
    commit([...treeOrder(questions), blankQuestion(questions, fields)]);
  };

  const addFollowUp = (parent: LeadQuestion, optionLabel: string) => {
    const child = blankQuestion(questions, {
      kind: "short",
      showIf: { questionId: parent.id, optionLabel },
    });
    commit(insertFollowUp(questions, parent.id, optionLabel, child));
  };

  const roots = topLevel(treeOrder(questions));
  const over = questions.length > META_QUESTION_GUIDE;

  return (
    <div>
      <SectionLabel
        hint={
          questions.length === 0
            ? "none yet"
            : `${questions.length} in order${over ? `, Meta allows about ${META_QUESTION_GUIDE}` : ""}`
        }
      >
        Questions
      </SectionLabel>

      <div className="flex flex-col gap-2.5">
        {roots.map((q, i) => (
          <QuestionCard
            key={q.id}
            question={q}
            number={`${i + 1}`}
            depth={0}
            questions={questions}
            patch={patch}
            patchNow={patchNow}
            commit={commit}
            onAddFollowUp={addFollowUp}
          />
        ))}
      </div>

      {questions.length < FORM_LIMITS.questions && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <PrefillPicker onPick={(field) => add({ kind: "prefill", prefill: field, label: field })} />
          {CUSTOM_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => add({ kind })}
              className="flex items-center gap-1.5 rounded-[var(--radius)] border border-dashed border-border px-2.5 py-1.5 text-[12.5px] font-medium text-muted transition-colors hover:border-brand hover:text-brand"
            >
              <Plus size={13} aria-hidden />
              {KIND_LABEL[kind]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

// Meta's prefill fields, in Meta's own categories. A panel rather than a select,
// because the grouping IS the information: which of these Facebook already
// knows is the only reason to pick one over asking.
function PrefillPicker({ onPick }: { onPick: (field: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1.5 rounded-[var(--radius)] border border-dashed px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
          open ? "border-brand text-brand" : "border-border text-muted hover:border-brand hover:text-brand",
        )}
      >
        <Plus size={13} aria-hidden />
        Prefill
      </button>

      {open && (
        <>
          {/* Clicking anywhere else shuts it. A panel this size that only closes
              by pressing its own button is a panel left open over the form. */}
          <button
            type="button"
            aria-label="Close the prefill list"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute bottom-full left-0 z-20 mb-1.5 max-h-80 w-64 overflow-y-auto rounded-lg border border-border bg-surface p-3 shadow-[0_18px_40px_-12px_rgba(0,0,0,.55)]">
            {PREFILL_GROUPS.map((group) => (
              <div key={group.label} className="mb-3 last:mb-0">
                <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-faint">
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-1">
                  {group.fields.map((field) => (
                    <button
                      key={field}
                      type="button"
                      onClick={() => {
                        onPick(field);
                        setOpen(false);
                      }}
                      className="rounded-full bg-surface-2 px-2.5 py-1 text-[11.5px] font-medium text-muted transition-colors hover:bg-brand hover:text-brand-fg"
                    >
                      {field}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function QuestionCard({
  question: q,
  number,
  depth,
  questions,
  patch,
  patchNow,
  commit,
  onAddFollowUp,
}: {
  question: LeadQuestion;
  number: string;
  depth: number;
  questions: LeadQuestion[];
  patch: (id: string, fields: Partial<LeadQuestion>) => void;
  patchNow: (id: string, fields: Partial<LeadQuestion>) => void;
  commit: (qs: LeadQuestion[]) => void;
  onAddFollowUp: (parent: LeadQuestion, optionLabel: string) => void;
}) {
  const onCommitAll = () => commit(questions);

  // Switching kind clears what the new kind cannot hold, so a question that was
  // a choice does not keep an invisible options list. A choice with follow-ups
  // hanging off it takes them with it: they are unaskable the moment the answer
  // that revealed them stops existing.
  const setKind = (kind: LeadQuestionKind) => {
    const cleared: Partial<LeadQuestion> = {
      kind,
      options: kind === "choice" ? q.options : [],
      prefill: kind === "prefill" ? q.prefill : "",
      multiSelect: kind === "choice" && q.multiSelect,
      minLength: kind === "short" ? q.minLength : 0,
      maxLength: kind === "short" ? q.maxLength : 0,
      inlineContext: kind === "appointment" || kind === "store_locator" ? q.inlineContext : "",
    };
    if (kind !== "choice" && q.options.length) {
      const orphans = questions.filter((c) => c.showIf?.questionId === q.id).map((c) => c.id);
      const next = orphans.reduce((list, id) => removeSubtree(list, id), questions);
      commit(next.map((c) => (c.id === q.id ? { ...c, ...cleared } : c)));
      return;
    }
    patchNow(q.id, cleared);
  };

  const setOption = (oi: number, label: string) => {
    patch(q.id, { options: q.options.map((o, j) => (j === oi ? { ...o, label } : o)) });
  };

  // Renaming an answer takes its follow-ups' rules with it. Without this the
  // rule points at a label that no longer exists and the cleaner drops it on
  // save, silently un-branching the form.
  const commitOption = (oi: number, was: string) => {
    const now = q.options[oi]?.label ?? "";
    if (now === was) return onCommitAll();
    commit(
      questions.map((c) =>
        c.showIf?.questionId === q.id && c.showIf.optionLabel === was
          ? { ...c, showIf: { questionId: q.id, optionLabel: now } }
          : c,
      ),
    );
  };

  const removeOption = (oi: number) => {
    const label = q.options[oi].label;
    const orphans = questions
      .filter((c) => c.showIf?.questionId === q.id && c.showIf.optionLabel === label)
      .map((c) => c.id);
    const pruned = orphans.reduce((list, id) => removeSubtree(list, id), questions);
    commit(
      pruned.map((c) =>
        c.id === q.id ? { ...c, options: c.options.filter((_, j) => j !== oi) } : c,
      ),
    );
  };

  return (
    <div
      className={cn(
        "rounded-[var(--radius)] border bg-surface-2 p-3",
        depth > 0 ? "border-brand/30" : "border-border",
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="shrink-0 font-data text-[12px] font-semibold text-faint tnum">
          {number}
        </span>

        <div className="flex flex-wrap gap-1">
          {(["prefill", ...CUSTOM_KINDS] as LeadQuestionKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={q.kind === k}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                q.kind === k ? "bg-brand text-brand-fg" : "bg-surface text-muted hover:text-text",
              )}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>

        <span className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => commit(moveQuestion(questions, q.id, -1))}
            aria-label={`Move question ${number} up`}
            className="text-faint transition-colors hover:text-text"
          >
            <ChevronUp size={15} />
          </button>
          <button
            type="button"
            onClick={() => commit(moveQuestion(questions, q.id, 1))}
            aria-label={`Move question ${number} down`}
            className="text-faint transition-colors hover:text-text"
          >
            <ChevronDown size={15} />
          </button>
          <button
            type="button"
            onClick={() => commit(removeSubtree(questions, q.id))}
            aria-label={`Remove question ${number}`}
            className="ml-1 text-faint transition-colors hover:text-danger"
          >
            <X size={15} />
          </button>
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <LineInput
          value={q.label}
          onChange={(v) => patch(q.id, { label: v })}
          onBlur={onCommitAll}
          placeholder={
            q.kind === "prefill"
              ? "Meta's wording, edit if you want"
              : q.kind === "appointment"
                ? "When suits you?"
                : q.kind === "store_locator"
                  ? "Which location?"
                  : "What are you asking?"
          }
          maxLength={FORM_LIMITS.questionLabel}
          ariaLabel={`Question ${number} text`}
        />

        {q.kind === "prefill" && (
          <>
            <input
              list="meta-prefill-fields"
              value={q.prefill}
              onChange={(e) => patch(q.id, { prefill: e.target.value })}
              onBlur={onCommitAll}
              placeholder="Email"
              maxLength={FORM_LIMITS.prefill}
              aria-label={`Question ${number} prefill field`}
              className="w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[13.5px] text-text placeholder:text-faint focus:border-brand focus:outline-none"
            />
            {/* Meta's list as suggestions, not a cage: it grows. */}
            <datalist id="meta-prefill-fields">
              {PREFILL_GROUPS.flatMap((g) => g.fields).map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </>
        )}

        {(q.kind === "appointment" || q.kind === "store_locator") && (
          <LineInput
            value={q.inlineContext}
            onChange={(v) => patch(q.id, { inlineContext: v })}
            onBlur={onCommitAll}
            placeholder="Small print under the picker"
            maxLength={FORM_LIMITS.inlineContext}
            ariaLabel={`Question ${number} inline context`}
          />
        )}
      </div>

      {q.kind === "choice" && (
        <div className="mt-2.5 flex flex-col gap-1.5">
          {q.options.map((o, oi) => (
            <AnswerRow
              key={oi}
              question={q}
              option={o}
              index={oi}
              number={number}
              questions={questions}
              onLabel={(v) => setOption(oi, v)}
              onCommitLabel={(was) => commitOption(oi, was)}
              onToggleDq={() =>
                patchNow(q.id, {
                  options: q.options.map((x, j) =>
                    j === oi ? { ...x, disqualify: !x.disqualify } : x,
                  ),
                })
              }
              onAddFollowUp={() => onAddFollowUp(q, o.label)}
              onAddFollowUpFor={onAddFollowUp}
              onRemove={() => removeOption(oi)}
              patch={patch}
              patchNow={patchNow}
              commit={commit}
              depth={depth}
            />
          ))}

          <div className="flex flex-wrap items-center gap-2 pl-4">
            {q.options.length < FORM_LIMITS.options && (
              <button
                type="button"
                onClick={() =>
                  patch(q.id, { options: [...q.options, { label: "", disqualify: false }] })
                }
                className="flex items-center gap-1.5 rounded-[var(--radius)] border border-dashed border-border px-2.5 py-1 text-[12px] font-medium text-muted transition-colors hover:border-brand hover:text-brand"
              >
                <Plus size={13} />
                Add answer
              </button>
            )}
            <Toggle
              on={q.multiSelect}
              onClick={() => patchNow(q.id, { multiSelect: !q.multiSelect })}
              label="Allow more than one"
            />
          </div>
        </div>
      )}

      <MetaRow q={q} number={number} patch={patch} patchNow={patchNow} onCommitAll={onCommitAll} />
    </div>
  );
}

// One answer of a multiple choice, and everything it reveals.
//
// The follow-up sits UNDER THE ANSWER, indented, which is the whole reason this
// row exists: in Meta a conditional question is drawn exactly here, and reading
// a branch as a rule listed further down the page is how a branch gets built
// backwards.
function AnswerRow({
  question: q,
  option,
  index,
  number,
  questions,
  onLabel,
  onCommitLabel,
  onToggleDq,
  onRemove,
  onAddFollowUp,
  onAddFollowUpFor,
  patch,
  patchNow,
  commit,
  depth,
}: {
  question: LeadQuestion;
  option: { label: string; disqualify: boolean };
  index: number;
  number: string;
  questions: LeadQuestion[];
  onLabel: (v: string) => void;
  onCommitLabel: (was: string) => void;
  onToggleDq: () => void;
  onRemove: () => void;
  onAddFollowUp: () => void;
  onAddFollowUpFor: (parent: LeadQuestion, optionLabel: string) => void;
  patch: (id: string, fields: Partial<LeadQuestion>) => void;
  patchNow: (id: string, fields: Partial<LeadQuestion>) => void;
  commit: (qs: LeadQuestion[]) => void;
  depth: number;
}) {
  // The label as the table last saw it, so a rename can carry its follow-ups'
  // rules across with it. Compared on blur, never during typing: a rule
  // re-pointed on every keystroke would chase a half-typed answer.
  const committed = useRef(option.label);
  const children = childrenOf(questions, q.id, option.label);
  const named = option.label.trim().length > 0;

  return (
    <div className="pl-4">
      <div className="flex items-center gap-2">
        <LineInput
          value={option.label}
          onChange={onLabel}
          onBlur={() => {
            onCommitLabel(committed.current);
            committed.current = option.label;
          }}
          placeholder="An answer they can pick"
          maxLength={FORM_LIMITS.optionLabel}
          ariaLabel={`Question ${number} option ${index + 1}`}
        />

        {/* Our own flag, not Meta's. It prints in the paste-out as an
            instruction and marks the branch that throws the lead away. */}
        <button
          type="button"
          onClick={onToggleDq}
          aria-pressed={option.disqualify}
          title="This answer means they are not a fit"
          className={cn(
            "shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold transition-colors",
            option.disqualify
              ? "bg-danger/15 text-danger"
              : "bg-surface text-faint hover:text-muted",
          )}
        >
          Disqualify
        </button>

        {/* A rule can only name an answer that has words in it, so the button
            is not offered until the answer does. */}
        {named && (
          <button
            type="button"
            onClick={onAddFollowUp}
            title="Ask something else when they pick this"
            className="flex shrink-0 items-center gap-1 rounded-full bg-surface px-2 py-1 text-[11px] font-semibold text-faint transition-colors hover:text-brand"
          >
            <CornerDownRight size={12} aria-hidden />
            Follow-up
          </button>
        )}

        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove option ${index + 1} of question ${number}`}
          className="shrink-0 text-faint transition-colors hover:text-danger"
        >
          <X size={14} />
        </button>
      </div>

      {children.length > 0 && (
        <div className="mt-1.5 border-l-2 border-brand/25 pl-3">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-faint">
            Only if {option.label || "this"}
          </p>
          <div className="flex flex-col gap-2">
            {children.map((child, ci) => (
              <QuestionCard
                key={child.id}
                question={child}
                number={`${number}.${ci + 1}`}
                depth={depth + 1}
                questions={questions}
                patch={patch}
                patchNow={patchNow}
                commit={commit}
                // Handed straight back down: adding a follow-up is the same
                // operation at every depth, because the list is flat regardless.
                onAddFollowUp={onAddFollowUpFor}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// The row of settings every question carries but nobody reads first: the CRM
// key, whether it can be skipped, and the length bounds on a typed answer.
//
// Below the question rather than beside it, because the field name is the most
// expensive thing on the card to get wrong and the least urgent to look at: it
// is invisible on the form and shows up as a column of nulls a week later.
function MetaRow({
  q,
  number,
  patch,
  patchNow,
  onCommitAll,
}: {
  q: LeadQuestion;
  number: string;
  patch: (id: string, fields: Partial<LeadQuestion>) => void;
  patchNow: (id: string, fields: Partial<LeadQuestion>) => void;
  onCommitAll: () => void;
}) {
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">field</span>
      <input
        type="text"
        value={q.fieldName}
        onChange={(e) => patch(q.id, { fieldName: e.target.value })}
        onBlur={onCommitAll}
        placeholder={defaultFieldName(q) || "field_name"}
        maxLength={FORM_LIMITS.fieldName}
        aria-label={`Question ${number} field name`}
        className="w-40 rounded-[var(--radius)] border border-border bg-surface px-2 py-1 font-data text-[12px] text-text placeholder:text-faint focus:border-brand focus:outline-none"
      />

      <Toggle
        on={q.optional}
        onClick={() => patchNow(q.id, { optional: !q.optional })}
        label="Optional"
      />

      {q.kind === "short" && (
        <span className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">
            length
          </span>
          <Bound
            value={q.minLength}
            onChange={(n) => patchNow(q.id, { minLength: n })}
            label={`Question ${number} minimum length`}
            placeholder="min"
          />
          <Bound
            value={q.maxLength}
            onChange={(n) => patchNow(q.id, { maxLength: n })}
            label={`Question ${number} maximum length`}
            placeholder="max"
          />
        </span>
      )}
    </div>
  );
}

function Bound({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
  placeholder: string;
}) {
  return (
    <input
      type="number"
      min={0}
      max={FORM_LIMITS.answerLength}
      // 0 means unset, and a box showing 0 reads as a bound of zero characters.
      value={value || ""}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      placeholder={placeholder}
      aria-label={label}
      className="w-16 rounded-[var(--radius)] border border-border bg-surface px-2 py-1 font-data text-[12px] text-text placeholder:text-faint focus:border-brand focus:outline-none"
    />
  );
}
