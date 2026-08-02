import { intakeGroups, type IntakeField } from "../../../lib/onboarding";
import type { IntakeAnswers } from "../../../lib/intake";

// The client's answers, grouped the way the funnel asked them.
//
// One renderer, used by both surfaces that show answers: the card on Client
// setup (a client who exists) and the detail on Submissions (a form that may
// never become one). They must not drift, because they are the same evidence.
//
// The questions come from the funnel's own schema, so a question added to the
// form appears here with no change.

export default function IntakeAnswerList({ answers }: { answers: IntakeAnswers }) {
  return (
    <div className="flex flex-col gap-4">
      {intakeGroups().map((group) => {
        const rows = group.fields
          .map((field) => ({ field, value: display(field, answers[field.key]) }))
          .filter((row) => row.value !== null);
        if (rows.length === 0) return null;

        return (
          <div key={group.key}>
            <p className="label-cap mb-2">{group.label}</p>
            <dl className="grid grid-cols-1 gap-x-5 gap-y-3 md:grid-cols-2">
              {rows.map(({ field, value }) => (
                <div
                  key={field.key}
                  className={
                    field.wide || field.type === "textarea" ? "md:col-span-2" : undefined
                  }
                >
                  <dt className="text-[11.5px] text-faint">{field.label}</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap break-words text-[13.5px] text-text">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}
    </div>
  );
}

// One answer as the client left it, or null when they left it blank. A blank
// renders as nothing at all rather than as an empty row: a question they
// skipped is not a fact about their business.
//
// Never rendered as markup. These are strings a stranger typed into a public
// form, so they go in as text and stay text.
export function display(field: IntakeField, raw: string | boolean | undefined): string | null {
  if (field.type === "checkbox") {
    // The funnel stores a tick as the string "yes" (see sanitizeAnswers, which
    // agrees on text for every answer), but a live in-progress submission can
    // still carry the boolean it was typed as.
    return raw === true || raw === "yes" || raw === "true" ? "Yes" : null;
  }
  const value = typeof raw === "boolean" ? String(raw) : (raw ?? "").trim();
  if (!value) return null;
  if (field.options) return field.options.find((o) => o.value === value)?.label ?? value;
  return value;
}
