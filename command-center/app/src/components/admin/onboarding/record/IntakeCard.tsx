import { useState } from "react";
import { ClipboardList } from "lucide-react";
import { Card, Field, SaveRow } from "./OnboardingKit";
import {
  INTAKE_KEYS,
  intakeAnswered,
  intakeGroups,
  type WizardField,
} from "../../../../lib/onboarding";

// What the client told us: the questionnaire they answer between paying and the
// kickoff call. Editable here because that is how it actually arrives - a form
// emailed over, answers read back on a call - and a record you cannot correct is
// a record nobody trusts.
//
// The questions come from the new-client wizard's own definitions, so this card
// never drifts from the form the client filled in.

export default function IntakeCard({
  intake,
  saving,
  saved,
  error,
  onSave,
}: {
  intake: Record<string, string>;
  saving: boolean;
  saved: boolean;
  error: string | null;
  onSave: (values: Record<string, string>) => void;
}) {
  // Seeded once, on mount. The parent gives this card a key of the tenant id,
  // so switching client remounts it with that client's answers. Re-seeding from
  // props on every change would mean a background refetch - one alt-tab back to
  // the browser is enough to trigger one - throwing away whatever is half-typed.
  const [values, setValues] = useState<Record<string, string>>(intake);

  const set = (key: string, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const answered = intakeAnswered(values);

  return (
    <Card
      icon={<ClipboardList />}
      tone="green"
      title="Intake answers"
      note="The client's own answers, in their words"
      right={
        <span className="onb-count">
          {answered} of {INTAKE_KEYS.length} answered
        </span>
      }
    >
      {intakeGroups().map((group) => (
        <div key={group.key} className="onb-phase">
          <div className="onb-phase-name">{group.label}</div>
          <div className="onb-grid" style={{ paddingBottom: 6 }}>
            {group.fields.map((field) => (
              <IntakeField
                key={field.key}
                field={field}
                value={values[field.key] ?? ""}
                onChange={(v) => set(field.key, v)}
              />
            ))}
          </div>
        </div>
      ))}

      <SaveRow
        pending={saving}
        saved={saved}
        error={error}
        onSave={() => onSave(values)}
        label="Save intake answers"
      />
    </Card>
  );
}

function IntakeField({
  field,
  value,
  onChange,
}: {
  field: WizardField;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `onb-i-${field.key}`;
  // Everything on this card is stored as text, so the two non-text controls get
  // a text answer: a radio stores its option value, a checkbox stores "yes".
  const wide = field.wide || field.type === "textarea";

  if (field.type === "textarea") {
    return (
      <Field label={field.label} htmlFor={id} hint={field.help} wide>
        <textarea
          id={id}
          value={value}
          placeholder={field.placeholder ?? "No answer yet"}
          onChange={(e) => onChange(e.target.value)}
        />
      </Field>
    );
  }

  if (field.type === "select") {
    return (
      <Field label={field.label} htmlFor={id} hint={field.help} wide={wide}>
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">No answer yet</option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
    );
  }

  if (field.type === "radio" || field.type === "checkbox") {
    const choices =
      field.type === "checkbox"
        ? [
            { value: "yes", label: "Yes" },
            { value: "no", label: "Not yet" },
          ]
        : (field.options ?? []);
    return (
      <div className={`onb-field${wide ? " wide" : ""}`}>
        <label htmlFor={`${id}-${choices[0]?.value ?? "0"}`}>{field.label}</label>
        <div className="onb-choices" role="group" aria-label={field.label}>
          {choices.map((choice) => (
            <button
              key={choice.value}
              id={`${id}-${choice.value}`}
              type="button"
              className={`onb-choice${value === choice.value ? " on" : ""}`}
              aria-pressed={value === choice.value}
              // Pressing the chosen option again clears it, so a wrong answer
              // can go back to "no answer" instead of being stuck.
              onClick={() => onChange(value === choice.value ? "" : choice.value)}
            >
              {choice.label}
            </button>
          ))}
        </div>
        {field.help && <span className="onb-hint">{field.help}</span>}
      </div>
    );
  }

  const type =
    field.type === "email" || field.type === "tel" || field.type === "url"
      ? field.type
      : "text";

  return (
    <Field
      label={field.label}
      htmlFor={id}
      hint={field.type === "file" ? "Paste the link to where this lives" : field.help}
      wide={wide}
    >
      <input
        id={id}
        type={type}
        value={value}
        placeholder={
          field.type === "file"
            ? "https://drive.google.com/..."
            : (field.placeholder ?? "No answer yet")
        }
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}
