import { useMemo, useState } from "react";
import { CalendarDays, Eye, MapPin, RotateCcw } from "lucide-react";
import {
  COMPLETION_CTA_LABELS,
  type LeadForm,
  type LeadQuestion,
} from "../../../../../functions/lib/adLeadForms";
import {
  SCREEN_LABEL,
  ctaTarget,
  disqualifiedBy,
  prefillSample,
  pruneAnswers,
  screensFor,
  toggleAnswer,
  visibleQuestions,
  type Answers,
  type ScreenId,
} from "../../../../lib/leadFormPreview";
import { cn } from "../../../../lib/cn";

// The instant form as the lead meets it, and it is FILLABLE.
//
// A static picture of a form with branching in it is worth very little: the one
// thing that goes wrong is a branch that never fires or fires on the wrong
// answer, and that is invisible until somebody taps. So this pane is a working
// form. Pick an answer and the follow-up appears under it exactly where Meta
// would put it, or does not, in front of the person who just wrote the rule.
//
// This is a SKETCH of Meta's chrome, not a replica. It exists to show shape,
// order and branching. The real form is built in Ads Manager off the paste-out.
//
// COLOUR BOUNDARY, same rule as the conversion-asset preview: everything inside
// the device frame is inline and Facebook's, because that is whose surface this
// is. Everything outside it uses our tokens. The frame is the boundary.

// The editor scopes --brand to this, so the form's controls and this pane read
// as one panel. Darker than Facebook's own #1877F2 on purpose: the button in
// the phone is large, our pills are 11px semibold, and white on #1877F2 is
// 4.0:1. This is 5.4:1.
export const META_ACCENT = "#0f62d0";
export const META_ACCENT_FG = "#ffffff";

// Facebook's own, used only inside the frame.
const FB_BLUE = "#1877f2";
const FB_INK = "#050505";
const FB_MUTED = "#65676b";
const FB_LINE = "#dadde1";
const FB_FIELD = "#f0f2f5";

const PHONE_WIDTH = 320;

export default function LeadFormPreview({
  form,
  clientName,
}: {
  form: LeadForm;
  clientName: string;
}) {
  const [answers, setAnswers] = useState<Answers>({});
  const [screenIdx, setScreenIdx] = useState(0);

  const screens = screensFor(form);
  const screen: ScreenId = screens[Math.min(screenIdx, screens.length - 1)] ?? "questions";

  const visible = useMemo(() => visibleQuestions(form.questions, answers), [form.questions, answers]);
  const dq = disqualifiedBy(form.questions, answers);

  // Answering rebuilds the map through the pruner, so a follow-up's answer does
  // not survive its parent being changed underneath it.
  const answer = (q: LeadQuestion, label: string) => {
    setAnswers((prev) => pruneAnswers(form.questions, toggleAnswer(q, prev, label)));
  };

  const type = (q: LeadQuestion, value: string) => {
    setAnswers((prev) => ({ ...prev, [q.id]: value ? [value] : [] }));
  };

  const reset = () => {
    setAnswers({});
    setScreenIdx(0);
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col border-t border-border bg-bg xl:border-t-0">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3.5">
        <Eye className="h-3.5 w-3.5 text-brand" aria-hidden />
        <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted">
          Live preview
        </span>

        {/* The screens as tabs, not as a wizard: a form is checked by jumping
            to the screen you just edited, not by walking it from the top. */}
        <div className="ml-auto flex gap-0.5 rounded-[var(--radius)] border border-border bg-surface p-0.5">
          {screens.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => setScreenIdx(i)}
              aria-pressed={i === screenIdx}
              className={cn(
                "rounded-[calc(var(--radius)-2px)] px-2 py-1 text-[11px] font-semibold transition-colors",
                i === screenIdx ? "bg-brand text-brand-fg" : "text-muted hover:text-text",
              )}
            >
              {SCREEN_LABEL[s]}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={reset}
          aria-label="Clear the answers and start again"
          className="shrink-0 rounded-[var(--radius)] border border-border p-1.5 text-faint transition-colors hover:border-brand hover:text-text"
        >
          <RotateCcw size={13} aria-hidden />
        </button>
      </div>

      {/* min-h-0 so this scrolls inside the frame instead of stretching it. */}
      <div className="flex min-h-0 flex-1 flex-col items-center gap-3 overflow-auto p-5">
        <div
          className="h-fit shrink-0 overflow-hidden rounded-2xl shadow-[0_18px_40px_-12px_rgba(0,0,0,.55)]"
          style={{ width: PHONE_WIDTH, background: "#ffffff", color: FB_INK }}
        >
          <div
            className="flex items-center gap-2 px-3 py-2"
            style={{ borderBottom: `1px solid ${FB_LINE}` }}
          >
            <span
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold"
              style={{ background: FB_FIELD, color: FB_MUTED }}
            >
              {(clientName || "C").slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">
              {clientName || "Your client"}
            </span>
            <span className="text-[10px]" style={{ color: FB_MUTED }}>
              Sponsored
            </span>
          </div>

          {screen === "intro" && <IntroScreen form={form} />}
          {screen === "questions" && (
            <QuestionsScreen
              form={form}
              visible={visible}
              answers={answers}
              onAnswer={answer}
              onType={type}
            />
          )}
          {screen === "review" && <ReviewScreen visible={visible} answers={answers} />}
          {screen === "completion" && <CompletionScreen form={form} />}
        </div>

        {dq.length > 0 && (
          <p className="max-w-[320px] text-center text-[11.5px] text-danger">
            {dq.length === 1 ? `"${dq[0]}" disqualifies this lead.` : `${dq.length} answers picked disqualify this lead.`}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Button({ children }: { children: string }) {
  return (
    <div
      className="mt-4 rounded-md py-2.5 text-center text-[13px] font-semibold"
      style={{ background: FB_BLUE, color: "#ffffff" }}
    >
      {children}
    </div>
  );
}

function IntroScreen({ form }: { form: LeadForm }) {
  const items = form.introDescription
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <div>
      {form.introImageUrl ? (
        <img src={form.introImageUrl} alt="" className="h-32 w-full object-cover" />
      ) : (
        <div className="h-24 w-full" style={{ background: FB_FIELD }} />
      )}
      <div className="px-4 py-4">
        <h4 className="m-0 text-[17px] font-bold leading-[1.25]">
          {form.introHeadline || "Your greeting headline"}
        </h4>
        {items.length > 0 &&
          (form.introLayout === "list" ? (
            <ul className="mt-2 flex flex-col gap-1.5">
              {items.map((item, i) => (
                <li key={i} className="flex gap-2 text-[13px] leading-snug">
                  <span style={{ color: FB_BLUE }}>•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed">
              {form.introDescription}
            </p>
          ))}
        <Button>Continue</Button>
      </div>
    </div>
  );
}

function QuestionsScreen({
  form,
  visible,
  answers,
  onAnswer,
  onType,
}: {
  form: LeadForm;
  visible: LeadQuestion[];
  answers: Answers;
  onAnswer: (q: LeadQuestion, label: string) => void;
  onType: (q: LeadQuestion, value: string) => void;
}) {
  return (
    <div className="px-4 py-4">
      {visible.length === 0 ? (
        <p className="py-6 text-center text-[12.5px]" style={{ color: FB_MUTED }}>
          No questions yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3.5">
          {visible.map((q) => (
            <QuestionField
              key={q.id}
              q={q}
              given={answers[q.id] ?? []}
              onAnswer={onAnswer}
              onType={onType}
            />
          ))}
        </div>
      )}

      <PrivacyBlock form={form} />
      <Button>{form.intent === "higher_intent" ? "Continue" : "Submit"}</Button>
    </div>
  );
}

function QuestionField({
  q,
  given,
  onAnswer,
  onType,
}: {
  q: LeadQuestion;
  given: string[];
  onAnswer: (q: LeadQuestion, label: string) => void;
  onType: (q: LeadQuestion, value: string) => void;
}) {
  const label = q.label || (q.kind === "prefill" ? q.prefill : "") || "Untitled question";

  return (
    <div>
      <p className="mb-1.5 text-[13px] font-semibold leading-snug">
        {label}
        {q.optional && (
          <span className="font-normal" style={{ color: FB_MUTED }}>
            {" "}
            (optional)
          </span>
        )}
      </p>

      {q.kind === "prefill" && (
        <div
          className="rounded-md px-3 py-2 text-[13px]"
          style={{ background: FB_FIELD, color: prefillSample(q.prefill) ? FB_INK : FB_MUTED }}
        >
          {prefillSample(q.prefill) || q.prefill || "Filled in by Facebook"}
        </div>
      )}

      {q.kind === "short" && (
        <input
          type="text"
          value={given[0] ?? ""}
          onChange={(e) => onType(q, e.target.value)}
          maxLength={q.maxLength || undefined}
          placeholder="Type an answer"
          aria-label={label}
          className="w-full rounded-md px-3 py-2 text-[13px] outline-none"
          style={{ background: FB_FIELD, color: FB_INK, border: `1px solid ${FB_LINE}` }}
        />
      )}

      {q.kind === "choice" && (
        <div className="flex flex-col gap-1">
          {q.options.length === 0 && (
            <p className="text-[12px]" style={{ color: FB_MUTED }}>
              No answers written yet.
            </p>
          )}
          {q.options.map((o, i) => {
            const on = given.includes(o.label);
            return (
              <button
                key={i}
                type="button"
                onClick={() => onAnswer(q, o.label)}
                aria-pressed={on}
                className="flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px]"
                style={{
                  background: on ? "#e7f0fd" : FB_FIELD,
                  border: `1px solid ${on ? FB_BLUE : FB_LINE}`,
                  color: FB_INK,
                }}
              >
                <span
                  className="grid h-4 w-4 shrink-0 place-items-center"
                  style={{
                    borderRadius: q.multiSelect ? 3 : 999,
                    border: `1.5px solid ${on ? FB_BLUE : FB_MUTED}`,
                    background: on ? FB_BLUE : "transparent",
                  }}
                >
                  {on && (
                    <span
                      className="block h-1.5 w-1.5"
                      style={{ borderRadius: q.multiSelect ? 1 : 999, background: "#ffffff" }}
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1">{o.label || "Untitled answer"}</span>
              </button>
            );
          })}
        </div>
      )}

      {q.kind === "appointment" && (
        <div
          className="flex items-center gap-2 rounded-md px-3 py-2 text-[13px]"
          style={{ background: FB_FIELD, border: `1px solid ${FB_LINE}`, color: FB_MUTED }}
        >
          <CalendarDays size={14} aria-hidden />
          Pick a date and time
        </div>
      )}

      {q.kind === "store_locator" && (
        <div
          className="flex items-center gap-2 rounded-md px-3 py-2 text-[13px]"
          style={{ background: FB_FIELD, border: `1px solid ${FB_LINE}`, color: FB_MUTED }}
        >
          <MapPin size={14} aria-hidden />
          Nearest location
        </div>
      )}

      {q.inlineContext && (
        <p className="mt-1 text-[11px] leading-snug" style={{ color: FB_MUTED }}>
          {q.inlineContext}
        </p>
      )}
    </div>
  );
}

function PrivacyBlock({ form }: { form: LeadForm }) {
  const hasAny =
    form.privacyUrl || form.disclaimerTitle || form.privacyDisclaimer || form.consents.length > 0;
  if (!hasAny) return null;

  return (
    <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${FB_LINE}` }}>
      {form.disclaimerTitle && (
        <p className="mb-1 text-[12px] font-semibold">{form.disclaimerTitle}</p>
      )}
      {form.privacyDisclaimer && (
        <p className="mb-2 whitespace-pre-wrap text-[11px] leading-snug" style={{ color: FB_MUTED }}>
          {form.privacyDisclaimer}
        </p>
      )}

      {form.consents.map((c, i) => (
        <label key={i} className="mb-1.5 flex gap-2 text-[11px] leading-snug">
          <span
            className="mt-0.5 block h-3.5 w-3.5 shrink-0 rounded-sm"
            style={{ border: `1.5px solid ${FB_MUTED}` }}
          />
          <span>
            {c.text}
            {c.optional && <span style={{ color: FB_MUTED }}> (optional)</span>}
          </span>
        </label>
      ))}

      {form.privacyUrl && (
        <p className="text-[11px]" style={{ color: FB_MUTED }}>
          By clicking Submit, you agree to send your info and agree to{" "}
          <span style={{ color: FB_BLUE }}>
            {form.privacyLinkText || form.privacyUrl}
          </span>
          .
        </p>
      )}
    </div>
  );
}

// Higher intent's extra step: the answers, read back before they are sent.
function ReviewScreen({ visible, answers }: { visible: LeadQuestion[]; answers: Answers }) {
  return (
    <div className="px-4 py-4">
      <h4 className="m-0 text-[15px] font-bold">Review your info</h4>
      <div className="mt-3 flex flex-col gap-2.5">
        {visible.length === 0 && (
          <p className="text-[12.5px]" style={{ color: FB_MUTED }}>
            Nothing to review yet.
          </p>
        )}
        {visible.map((q) => {
          const given = answers[q.id] ?? [];
          const shown =
            q.kind === "prefill"
              ? prefillSample(q.prefill) || q.prefill
              : given.join(", ") || "Not answered";
          return (
            <div key={q.id}>
              <p className="text-[11px]" style={{ color: FB_MUTED }}>
                {q.label || q.prefill || "Untitled question"}
              </p>
              <p className="text-[13px]">{shown}</p>
            </div>
          );
        })}
      </div>
      <Button>Submit</Button>
    </div>
  );
}

function CompletionScreen({ form }: { form: LeadForm }) {
  const target = ctaTarget(form);
  return (
    <div className="px-4 py-6">
      <h4 className="m-0 text-[17px] font-bold leading-[1.25]">
        {form.completionHeadline || "Thanks, you're all set"}
      </h4>
      {form.completionBody && (
        <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed">
          {form.completionBody}
        </p>
      )}
      <Button>{form.completionCta || COMPLETION_CTA_LABELS[form.completionCtaType]}</Button>
      {target && (
        <p className="mt-2 break-all text-center text-[10.5px]" style={{ color: FB_MUTED }}>
          {target}
        </p>
      )}
    </div>
  );
}
