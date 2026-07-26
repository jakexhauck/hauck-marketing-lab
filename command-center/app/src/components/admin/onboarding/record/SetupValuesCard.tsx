import { useEffect, useMemo, useState } from "react";
import { ChevronRight, KeyRound } from "lucide-react";
import { Card, Field, SaveRow } from "./OnboardingKit";
import { ONBOARDING_FIELDS, type FieldGroup } from "../../../../lib/onboarding";

// The values that get written into the client's GHL sub-account: company
// details, the rep who gets the alerts, the calendars the workflows book into.
//
// Saving here only writes to our database. Nothing reaches GHL until Push
// values to GHL is pressed, and the card says so, because a form that looks
// like it published when it only saved is how a client ends up live with last
// month's phone number.

const GROUPS: { id: FieldGroup; label: string; note: string; openByDefault: boolean }[] = [
  {
    id: "connection",
    label: "Connection",
    note: "Kept on the client record, never written to GHL",
    openByDefault: true,
  },
  { id: "business", label: "Business", note: "", openByDefault: false },
  { id: "rep", label: "Rep and alerts", note: "", openByDefault: false },
  { id: "calendars", label: "Calendars and confirmation pages", note: "", openByDefault: false },
];

const TOKEN_KEY = "ghl_token";

export default function SetupValuesCard({
  fields,
  hasToken,
  saving,
  saved,
  error,
  onSave,
}: {
  fields: Record<string, string>;
  hasToken: boolean;
  saving: boolean;
  saved: boolean;
  error: string | null;
  onSave: (values: Record<string, string>) => void;
}) {
  // Seeded once, on mount; the parent keys this card by tenant id so switching
  // client remounts it. Re-seeding on every props change would let a background
  // refetch discard half-typed values.
  const [values, setValues] = useState<Record<string, string>>(fields);
  // The token is write-only: the API never sends one back, so it starts empty
  // every time and is only included in the save when something was typed.
  const [token, setToken] = useState("");

  // Once a save lands the token is on file, so clear the box rather than leave
  // the secret sitting in a form field.
  useEffect(() => {
    if (saved) setToken("");
  }, [saved]);

  const set = (key: string, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const counts = useMemo(() => {
    const out: Record<string, { set: number; total: number }> = {};
    for (const group of GROUPS) {
      const groupFields = ONBOARDING_FIELDS.filter((f) => f.group === group.id);
      const filled = groupFields.filter((f) =>
        f.key === TOKEN_KEY ? hasToken || token.trim() !== "" : (values[f.key] ?? "").trim() !== "",
      );
      out[group.id] = { set: filled.length, total: groupFields.length };
    }
    return out;
  }, [values, token, hasToken]);

  const submit = () => {
    const patch = { ...values };
    if (token.trim()) patch[TOKEN_KEY] = token.trim();
    onSave(patch);
  };

  return (
    <Card
      icon={<KeyRound />}
      tone="amber"
      title="Setup values"
      note="Saved here, pushed to GHL when you press the button above"
    >
      {GROUPS.map((group) => {
        const groupFields = ONBOARDING_FIELDS.filter((f) => f.group === group.id);
        const count = counts[group.id];
        return (
          <details key={group.id} className="onb-group" open={group.openByDefault}>
            <summary>
              <span className="onb-group-chev" aria-hidden>
                <ChevronRight size={15} />
              </span>
              {group.label}
              <span
                className={`onb-group-count${count.set === count.total ? " full" : ""}`}
              >
                {count.set} of {count.total} set
              </span>
            </summary>
            <div className="onb-grid">
              {group.note && (
                <p className="onb-hint" style={{ gridColumn: "1 / -1", marginTop: -2 }}>
                  {group.note}
                </p>
              )}
              {groupFields.map((field) =>
                field.key === TOKEN_KEY ? (
                  <Field
                    key={field.key}
                    label={field.label}
                    htmlFor={`onb-f-${field.key}`}
                    hint={hasToken ? "A token is on file. Type a new one to replace it." : undefined}
                  >
                    <input
                      id={`onb-f-${field.key}`}
                      type="password"
                      autoComplete="off"
                      value={token}
                      placeholder={hasToken ? "Token on file" : "Not set"}
                      onChange={(e) => setToken(e.target.value)}
                    />
                  </Field>
                ) : (
                  <Field
                    key={field.key}
                    label={field.label}
                    htmlFor={`onb-f-${field.key}`}
                    hint={
                      field.customValue
                        ? `Custom value: ${field.customValue}`
                        : undefined
                    }
                  >
                    <input
                      id={`onb-f-${field.key}`}
                      type="text"
                      value={values[field.key] ?? ""}
                      placeholder="Not set"
                      onChange={(e) => set(field.key, e.target.value)}
                    />
                  </Field>
                ),
              )}
            </div>
          </details>
        );
      })}

      <SaveRow
        pending={saving}
        saved={saved}
        error={error}
        onSave={submit}
        label="Save setup values"
      />
    </Card>
  );
}
