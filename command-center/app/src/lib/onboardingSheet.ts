import { intakeGroups } from "./onboarding";
import type { IntakeAnswers, IntakeField } from "./intake";
import { CLIENT_SECRET_FIELDS, type ClientSecretView } from "./clientSecrets";

// The client sheet: everything we hold about one client, laid out to be read
// and copied rather than edited.
//
// Onboarding stopped being a checklist. What is left is this: their answers,
// grouped exactly as the funnel asked for them, plus the wiring that makes
// their account real, in one document Jake can paste out of while he builds
// their sub-account.
//
// Pure on purpose. The page fetches; this decides what a sheet is.

export interface SheetField {
  key: string;
  label: string;
  /** Null when they left it blank. The page says so rather than hiding it. */
  value: string | null;
  /** What to show in place of a blank. An unanswered question and an unwired
   *  credential are different absences and should not read the same. */
  placeholder: string;
  /** Ids and credentials, set in the mono face so they can be checked by eye. */
  mono?: boolean;
}

export interface SheetSection {
  key: string;
  label: string;
  fields: SheetField[];
}

// The wiring worth showing. GA4 and the Google place id are left out for the
// same reason the old wiring form left them out: Jake does not do analytics or
// reviews work, and three permanently empty rows read as something unfinished.
const WIRING_COLUMNS = ["ghl_location_id", "ghl_token", "meta_ad_account_id"];

/**
 * One answer as the client left it, or null when they left it blank.
 *
 * Never rendered as markup: these are strings a stranger typed into a public
 * form, so they go in as text and stay text.
 */
export function displayAnswer(
  field: IntakeField,
  raw: string | boolean | undefined,
): string | null {
  if (field.type === "checkbox") {
    // The funnel stores a tick as the string "yes", but a submission still being
    // typed can carry the boolean it was typed as.
    return raw === true || raw === "yes" || raw === "true" ? "Yes" : null;
  }
  const value = typeof raw === "boolean" ? String(raw) : (raw ?? "").trim();
  if (!value) return null;
  if (field.options) return field.options.find((o) => o.value === value)?.label ?? value;
  return value;
}

/**
 * Every section of a client's sheet, in reading order.
 *
 * Sections with nothing answered at all are dropped; a section with some
 * answers keeps its blank rows, because "we asked and they skipped it" is worth
 * seeing when you are on the phone to them.
 *
 * Pass an empty wiring list for a form that has not become a client yet: they
 * get the same sheet, minus a Wiring section there is nothing to put in.
 */
export function sheetSections(
  answers: IntakeAnswers,
  wiring: ClientSecretView[],
): SheetSection[] {
  const sections: SheetSection[] = intakeGroups()
    .map((group) => ({
      key: group.key,
      label: group.label,
      fields: group.fields.map((field: IntakeField) => ({
        key: field.key,
        label: field.label,
        value: displayAnswer(field, answers[field.key]),
        placeholder: "Not answered",
      })),
    }))
    .filter((section) => section.fields.some((f) => f.value !== null));

  const byColumn = new Map(wiring.map((f) => [f.column, f]));
  const wiringFields: SheetField[] = CLIENT_SECRET_FIELDS.filter((f) =>
    WIRING_COLUMNS.includes(f.column),
  ).map((f) => {
    const view = byColumn.get(f.column);
    return {
      key: f.column,
      label: f.label,
      // `display` is the id in full for an id, and masked to its last four for a
      // secret. A token cannot be copied out of here, and should not be: the
      // browser is never sent one.
      value: view?.configured ? (view.display ?? "Saved") : null,
      placeholder: "Not set up yet",
      mono: true,
    };
  });

  if (wiring.length > 0) {
    sections.push({ key: "wiring", label: "Wiring", fields: wiringFields });
  }

  return sections;
}

/** The whole sheet as plain text, for the copy-everything button. */
export function sheetText(sections: SheetSection[]): string {
  return sections
    .map((section) => {
      const rows = section.fields
        .map((f) => `${f.label}: ${f.value ?? "-"}`)
        .join("\n");
      return `${section.label.toUpperCase()}\n${rows}`;
    })
    .join("\n\n");
}
