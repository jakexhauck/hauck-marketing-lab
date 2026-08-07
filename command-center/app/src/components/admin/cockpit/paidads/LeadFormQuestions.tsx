import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import {
  FORM_LIMITS,
  PREFILL_SUGGESTIONS,
  type LeadQuestion,
  type LeadQuestionKind,
} from "../../../../../functions/lib/adLeadForms";
import { LineInput, SectionLabel } from "./adBuilderShared";

// The question list inside a lead form draft (0090).
//
// Three kinds, because Meta has three: a prefill it fills from the profile, a
// short typed answer, and a multiple choice. Only a choice can be branched on,
// so only a choice grows an options list and only a choice can be named by
// another question's rule.
//
// ORDER MATTERS and is editable, because a rule may only point backwards: Meta
// cannot ask a question conditional on an answer it has not collected yet. Move
// a question above the choice it depends on and the rule is dropped on save,
// which is why the rule picker only ever offers the choices ABOVE the row.

const KINDS: { id: LeadQuestionKind; label: string }[] = [
  { id: "prefill", label: "Prefill" },
  { id: "short", label: "Short answer" },
  { id: "choice", label: "Multiple choice" },
];

// A new question needs an id no existing one has, and it has to survive the
// list being reordered afterwards.
function nextId(questions: LeadQuestion[]): string {
  let n = questions.length + 1;
  const taken = new Set(questions.map((q) => q.id));
  while (taken.has(`q${n}`)) n += 1;
  return `q${n}`;
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
  const patch = (i: number, fields: Partial<LeadQuestion>) => {
    onChange(questions.map((q, j) => (j === i ? { ...q, ...fields } : q)));
  };

  // Structural edits save at once. They are clicks with a visible result, and
  // waiting for a blur that may never come is how one gets lost.
  const patchNow = (i: number, fields: Partial<LeadQuestion>) => {
    const next = questions.map((q, j) => (j === i ? { ...q, ...fields } : q));
    onChange(next);
    onCommit(next);
  };

  const add = () => {
    onChange([
      ...questions,
      {
        id: nextId(questions),
        kind: "short",
        label: "",
        prefill: "",
        options: [],
        showIf: null,
      },
    ]);
  };

  const remove = (i: number) => {
    const next = questions.filter((_, j) => j !== i);
    onChange(next);
    onCommit(next);
  };

  const move = (i: number, by: -1 | 1) => {
    const to = i + by;
    if (to < 0 || to >= questions.length) return;
    const next = [...questions];
    [next[i], next[to]] = [next[to], next[i]];
    onChange(next);
    onCommit(next);
  };

  // Switching kind clears what the new kind cannot hold, so a question that was
  // a choice does not keep an invisible options list.
  const setKind = (i: number, kind: LeadQuestionKind) => {
    patchNow(i, {
      kind,
      options: kind === "choice" ? questions[i].options : [],
      prefill: kind === "prefill" ? questions[i].prefill : "",
    });
  };

  const setOption = (i: number, oi: number, label: string) => {
    patch(i, { options: questions[i].options.map((o, j) => (j === oi ? { ...o, label } : o)) });
  };

  const toggleDq = (i: number, oi: number) => {
    patchNow(i, {
      options: questions[i].options.map((o, j) =>
        j === oi ? { ...o, disqualify: !o.disqualify } : o,
      ),
    });
  };

  const addOption = (i: number) => {
    patch(i, { options: [...questions[i].options, { label: "", disqualify: false }] });
  };

  const removeOption = (i: number, oi: number) => {
    patchNow(i, { options: questions[i].options.filter((_, j) => j !== oi) });
  };

  return (
    <div>
      <SectionLabel hint={questions.length === 0 ? "none yet" : `${questions.length} in order`}>
        Questions
      </SectionLabel>

      <div className="flex flex-col gap-2.5">
        {questions.map((q, i) => (
          <div key={q.id} className="rounded-[var(--radius)] border border-border bg-surface-2 p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="w-4 shrink-0 font-data text-[12px] font-semibold text-faint tnum">
                {i + 1}
              </span>

              <div className="flex flex-wrap gap-1">
                {KINDS.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => setKind(i, k.id)}
                    aria-pressed={q.kind === k.id}
                    className={
                      "rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-colors " +
                      (q.kind === k.id
                        ? "bg-brand text-white"
                        : "bg-surface text-muted hover:text-text")
                    }
                  >
                    {k.label}
                  </button>
                ))}
              </div>

              <span className="ml-auto flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={`Move question ${i + 1} up`}
                  className="text-faint transition-colors hover:text-text disabled:opacity-30"
                >
                  <ChevronUp size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === questions.length - 1}
                  aria-label={`Move question ${i + 1} down`}
                  className="text-faint transition-colors hover:text-text disabled:opacity-30"
                >
                  <ChevronDown size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label={`Remove question ${i + 1}`}
                  className="ml-1 text-faint transition-colors hover:text-danger"
                >
                  <X size={15} />
                </button>
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <LineInput
                value={q.label}
                onChange={(v) => patch(i, { label: v })}
                onBlur={() => onCommit(questions)}
                placeholder={
                  q.kind === "prefill" ? "Meta's wording, edit if you want" : "What are you asking?"
                }
                maxLength={FORM_LIMITS.questionLabel}
                ariaLabel={`Question ${i + 1} text`}
              />

              {q.kind === "prefill" && (
                <>
                  <input
                    list="meta-prefill-fields"
                    value={q.prefill}
                    onChange={(e) => patch(i, { prefill: e.target.value })}
                    onBlur={() => onCommit(questions)}
                    placeholder="Email"
                    maxLength={FORM_LIMITS.prefill}
                    aria-label={`Question ${i + 1} prefill field`}
                    className="w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[13.5px] text-text placeholder:text-faint focus:border-brand focus:outline-none"
                  />
                  {/* Meta's list as suggestions, not a cage: it grows. */}
                  <datalist id="meta-prefill-fields">
                    {PREFILL_SUGGESTIONS.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </>
              )}
            </div>

            {q.kind === "choice" && (
              <div className="mt-2.5 flex flex-col gap-1.5 pl-4">
                {q.options.map((o, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <LineInput
                      value={o.label}
                      onChange={(v) => setOption(i, oi, v)}
                      onBlur={() => onCommit(questions)}
                      placeholder="An answer they can pick"
                      maxLength={FORM_LIMITS.optionLabel}
                      ariaLabel={`Question ${i + 1} option ${oi + 1}`}
                    />
                    {/* The outcome half of the logic. Meta has no such flag, so
                        this prints in the paste-out as an instruction. */}
                    <button
                      type="button"
                      onClick={() => toggleDq(i, oi)}
                      aria-pressed={o.disqualify}
                      title="This answer means they are not a fit"
                      className={
                        "shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold transition-colors " +
                        (o.disqualify
                          ? "bg-danger/15 text-danger"
                          : "bg-surface text-faint hover:text-muted")
                      }
                    >
                      Disqualify
                    </button>
                    <button
                      type="button"
                      onClick={() => removeOption(i, oi)}
                      aria-label={`Remove option ${oi + 1} of question ${i + 1}`}
                      className="shrink-0 text-faint transition-colors hover:text-danger"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {q.options.length < FORM_LIMITS.options && (
                  <button
                    type="button"
                    onClick={() => addOption(i)}
                    className="flex items-center gap-1.5 self-start rounded-[var(--radius)] border border-dashed border-border px-2.5 py-1 text-[12px] font-medium text-muted transition-colors hover:border-brand hover:text-brand"
                  >
                    <Plus size={13} />
                    Add answer
                  </button>
                )}
              </div>
            )}

            <ShowIfRow
              index={i}
              question={q}
              earlier={questions.slice(0, i)}
              onSet={(showIf) => patchNow(i, { showIf })}
            />
          </div>
        ))}

        {questions.length < FORM_LIMITS.questions && (
          <button
            type="button"
            onClick={add}
            className="flex items-center gap-1.5 self-start rounded-[var(--radius)] border border-dashed border-border px-2.5 py-1.5 text-[12.5px] font-medium text-muted transition-colors hover:border-brand hover:text-brand"
          >
            <Plus size={14} />
            Add question
          </button>
        )}
      </div>
    </div>
  );
}

// The conditional rule. Only offers choices ABOVE this row, because that is the
// only thing Meta can express and the only thing the server will keep.
function ShowIfRow({
  index,
  question,
  earlier,
  onSet,
}: {
  index: number;
  question: LeadQuestion;
  earlier: LeadQuestion[];
  onSet: (showIf: LeadQuestion["showIf"]) => void;
}) {
  const choices = earlier.filter((q) => q.kind === "choice" && q.options.length > 0);
  if (choices.length === 0) return null;

  const current = question.showIf;
  const selected = current ? choices.find((c) => c.id === current.questionId) : undefined;

  // One <select> for the question, one for its answer. The pair encodes
  // "questionId|optionLabel" so a single change handler can read both.
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
      <span className="text-[11.5px] font-semibold uppercase tracking-wide text-faint">
        Only ask if
      </span>

      <select
        value={current?.questionId ?? ""}
        onChange={(e) => {
          const q = choices.find((c) => c.id === e.target.value);
          onSet(q ? { questionId: q.id, optionLabel: q.options[0].label } : null);
        }}
        aria-label={`Question ${index + 1} depends on`}
        className="rounded-[var(--radius)] border border-border bg-surface px-2 py-1 text-[12.5px] text-text focus:border-brand focus:outline-none"
      >
        <option value="">Always ask</option>
        {choices.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label || c.id}
          </option>
        ))}
      </select>

      {selected && (
        <>
          <span className="text-[12.5px] text-faint">is</span>
          <select
            value={current?.optionLabel ?? ""}
            onChange={(e) => onSet({ questionId: selected.id, optionLabel: e.target.value })}
            aria-label={`Question ${index + 1} required answer`}
            className="rounded-[var(--radius)] border border-border bg-surface px-2 py-1 text-[12.5px] text-text focus:border-brand focus:outline-none"
          >
            {selected.options.map((o) => (
              <option key={o.label} value={o.label}>
                {o.label}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}
