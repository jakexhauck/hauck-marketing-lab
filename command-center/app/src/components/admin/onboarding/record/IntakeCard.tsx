import { ClipboardList } from "lucide-react";
import { Card } from "./OnboardingKit";
import {
  INTAKE_KEYS,
  intakeAnswered,
  intakeGroups,
  type IntakeField,
} from "../../../../lib/onboarding";

// What the client told us, in their own words.
//
// Read-only, and that is the point. These are the answers the client typed into
// the funnel themselves; editing them here would quietly replace what they said
// with what we remember them saying, and the record would stop being evidence.
// Anything that needs correcting for our own use is a setup value, and those are
// editable on the card above.
//
// The questions come from the funnel's own schema, so this card never drifts
// from the form the client actually filled in.

export default function IntakeCard({ intake }: { intake: Record<string, string> }) {
  const answered = intakeAnswered(intake);

  return (
    <Card
      icon={<ClipboardList />}
      tone="green"
      title="What the client told us"
      note="Their own answers, from the intake form"
      right={
        <span className="onb-count">
          {answered} of {INTAKE_KEYS.length} answered
        </span>
      }
    >
      {answered === 0 ? (
        <p className="onb-empty-line">
          No answers yet. They appear here as soon as the client completes the intake form.
        </p>
      ) : (
        intakeGroups().map((group) => {
          const rows = group.fields
            .map((field) => ({ field, value: display(field, intake[field.key]) }))
            .filter((row) => row.value !== null);
          if (rows.length === 0) return null;

          return (
            <div key={group.key} className="onb-phase">
              <div className="onb-phase-name">{group.label}</div>
              <dl className="onb-answers">
                {rows.map(({ field, value }) => (
                  <div
                    key={field.key}
                    className={`onb-answer${field.wide || field.type === "textarea" ? " wide" : ""}`}
                  >
                    <dt>{field.label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })
      )}
    </Card>
  );
}

// One answer as the client left it, or null when they left it blank. A blank
// renders as nothing at all rather than as an empty row: a question they skipped
// is not a fact about their business.
function display(field: IntakeField, raw: string | undefined): string | null {
  if (field.type === "checkbox") {
    // The funnel stores a tick as the string "yes" (see buildCreatePayload and
    // sanitizeAnswers, which agree on text for every answer).
    return raw === "yes" || raw === "true" ? "Yes" : null;
  }
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (field.options) return field.options.find((o) => o.value === value)?.label ?? value;
  return value;
}
