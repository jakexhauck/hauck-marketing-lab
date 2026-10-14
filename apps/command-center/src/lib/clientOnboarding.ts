// The new-client wizard, declared as data.
//
// Three steps, all of them Jake's: the technical shell that stands a client up
// (business, brand, connections). This is the MANUAL path, for a client who
// never filled in the intake funnel. Everything the client themselves can
// answer lives in src/lib/intake.ts and arrives through that funnel instead.
//
// It used to run to six steps and ask Jake to type the client's answers for
// them. Those three steps moved to the funnel, where the person who knows the
// answers is the one being asked.
//
// The wizard, its validation and its review screen all render from
// ONBOARDING_FIELDS. Adding a field is one entry here, not a JSX edit in three
// places. See docs/build-plans/onboarding-funnel-board.md.

// No "file" type, deliberately. The wizard used to offer three uploaders with
// nowhere to put the bytes: the only Drive grant that can transfer files runs on
// an OAuth client whose consent screen is still in Testing, so its token dies
// weekly. Creating a client now creates the client's Drive FOLDER instead
// (functions/lib/clientDriveFolder.ts), and the assets go in there.
export type FieldType =
  | "text"
  | "email"
  | "tel"
  | "url"
  | "password"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "color";

export interface FieldOption {
  value: string;
  label: string;
}

export interface OnboardingField {
  key: string;
  label: string;
  type: FieldType;
  step: number;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: FieldOption[];
  // Lay the field out full-width instead of in the two-column grid.
  wide?: boolean;
}

export interface OnboardingStep {
  n: number;
  key: string;
  label: string;
  blurb: string;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    n: 1,
    key: "business",
    label: "Business",
    blurb: "What we are standing up, and where it will live.",
  },
  {
    n: 2,
    key: "brand",
    label: "Brand",
    blurb: "How the client's app looks and what it calls things.",
  },
  {
    n: 3,
    key: "connections",
    label: "Access & Connections",
    blurb: "All optional. Every one of these can be added later from the client's config.",
  },
];

// US-first, because every client so far is. Ordered west to east, then the
// outliers. America/Detroit sits in here deliberately: the app currently runs on
// one global booking timezone and GHL has the Willis location on America/Cancun
// for a Garden City, Michigan business. Capturing it per client at intake is the
// first half of that fix.
export const TIMEZONES: FieldOption[] = [
  { value: "Pacific/Honolulu", label: "Hawaii (HST)" },
  { value: "America/Anchorage", label: "Alaska (AKT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Phoenix", label: "Arizona (no DST)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Detroit", label: "Eastern - Detroit (ET)" },
  { value: "America/Toronto", label: "Eastern - Toronto (ET)" },
];

export const ONBOARDING_FIELDS: OnboardingField[] = [
  // 1 - Business
  {
    key: "name",
    label: "Business name",
    type: "text",
    step: 1,
    required: true,
    placeholder: "Willis Exteriors",
  },
  {
    key: "niche",
    label: "Niche",
    type: "text",
    step: 1,
    required: true,
    placeholder: "Roofing & Exteriors",
  },
  {
    key: "appName",
    label: "App name",
    type: "text",
    step: 1,
    help: "Shown in the client's own app. Defaults to the business name.",
  },
  {
    key: "subdomain",
    label: "Subdomain",
    type: "text",
    step: 1,
    required: true,
    help: "Lowercase letters, numbers and hyphens. Derived from the business name until you edit it.",
  },
  {
    key: "websiteUrl",
    label: "Website URL",
    type: "url",
    step: 1,
    placeholder: "https://willisexteriors.com",
  },

  // 2 - Brand
  {
    key: "brandColor",
    label: "Brand colour",
    type: "color",
    step: 2,
    required: true,
  },
  {
    key: "brandInitials",
    label: "Brand initials",
    type: "text",
    step: 2,
    help: "Two letters for the avatar. Derived from the business name until you edit it.",
  },
  {
    key: "wonLabel",
    label: '"Won" label',
    type: "text",
    step: 2,
    placeholder: "Won",
    help: "What this trade calls a closed deal. Job Booked, Sold, Won.",
  },
  {
    key: "valueLabel",
    label: '"Job Value" label',
    type: "text",
    step: 2,
    placeholder: "Job Value",
  },

  // 3 - Access & Connections
  { key: "ownerName", label: "Owner name", type: "text", step: 3 },
  { key: "ownerEmail", label: "Owner email", type: "email", step: 3 },
  {
    key: "ownerPassword",
    label: "Owner password",
    type: "password",
    step: 3,
    help: "At least 8 characters. Never written to the saved draft.",
  },
  { key: "ghlLocationId", label: "GHL Location ID", type: "text", step: 3 },
  {
    key: "ghlToken",
    label: "GHL Private Integration Token",
    type: "password",
    step: 3,
    help: "Never written to the saved draft.",
  },
  {
    key: "metaAdAccountId",
    label: "Meta ad account",
    type: "text",
    step: 3,
    placeholder: "act_123456789",
  },
  {
    key: "ga4PropertyId",
    label: "GA4 property ID",
    type: "text",
    step: 3,
    placeholder: "123456789",
  },
  { key: "googlePlaceId", label: "Google Place ID", type: "text", step: 3 },
];

// A password and an API token have no business sitting in a JS-readable store
// on a shared machine. Both are stripped before the draft is written to
// localStorage, so they survive a step change (React state) but not a refresh.
// Each one says so in its own help text.
export const SENSITIVE_KEYS = ["ownerPassword", "ghlToken"] as const;

// What the draft can hold. Every wizard answer is a string or a checkbox.
export type DraftValues = Record<string, string | boolean | undefined>;

// What the wizard starts with. Kept here rather than inline in the route so
// isPristine has something to compare against.
export const DEFAULT_VALUES: DraftValues = {
  brandColor: "#1d6fb8",
  wonLabel: "Won",
  valueLabel: "Job Value",
};

// True when nothing has been entered beyond the defaults. A draft is only worth
// writing, and only worth announcing on the next visit, when this is false.
export function isPristine(values: DraftValues): boolean {
  return ONBOARDING_FIELDS.every((field) => {
    const raw = values[field.key];
    const current = typeof raw === "string" ? raw.trim() : raw;
    // An empty field holds nothing the user typed, whatever its default is. A
    // cleared brand colour counts as untouched for the same reason.
    if (current === undefined || current === "" || current === false) return true;
    return current === DEFAULT_VALUES[field.key];
  });
}

export function slugify(input: string): string {
  return (input ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function deriveInitials(name: string): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function fieldsForStep(step: number): OnboardingField[] {
  return ONBOARDING_FIELDS.filter((f) => f.step === step);
}

function textValue(values: DraftValues, key: string): string {
  const raw = values[key];
  return typeof raw === "string" ? raw.trim() : "";
}

export function missingRequired(step: number, values: DraftValues): OnboardingField[] {
  return fieldsForStep(step).filter((f) => f.required && !textValue(values, f.key));
}

// Deliberately loose: enough to catch a typo, not so strict it rejects a valid
// address. Anything stricter belongs to the mail server, not this form.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface StepValidation {
  ok: boolean;
  errors: Record<string, string>;
}

export function validateStep(step: number, values: DraftValues): StepValidation {
  const errors: Record<string, string> = {};

  for (const field of missingRequired(step, values)) {
    errors[field.key] = `${field.label} is required`;
  }

  for (const field of fieldsForStep(step)) {
    const value = textValue(values, field.key);
    if (!value) continue;
    if (field.type === "email" && !EMAIL_RE.test(value)) {
      errors[field.key] = "That does not look like an email address";
    }
    if (field.key === "subdomain" && !SLUG_RE.test(value)) {
      errors[field.key] = "Lowercase letters, numbers and hyphens only";
    }
  }

  // Owner email and password are a pair, and the password has an 8-character
  // floor. Both rules mirror POST /api/admin/clients, so a form that passes here
  // will not be bounced by the API once this is wired up.
  if (step === 3) {
    const email = textValue(values, "ownerEmail");
    const password = textValue(values, "ownerPassword");
    if (email && !password) {
      errors.ownerPassword = "Set a password, or clear the owner email";
    }
    if (password && !email) {
      errors.ownerEmail = "Set an owner email, or clear the password";
    }
    if (password && password.length < 8) {
      errors.ownerPassword = "At least 8 characters";
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

// --- Submitting ---------------------------------------------------------------

/** What POST /api/admin/clients is sent when the wizard is completed. */
export interface CreateClientPayload {
  name: string;
  niche: string;
  slug: string;
  appName?: string;
  brandColor?: string;
  brandInitials?: string;
  wonLabel?: string;
  valueLabel?: string;
  websiteUrl?: string;
  ownerName?: string;
  ownerEmail?: string;
  ownerPassword?: string;
  ghlLocationId?: string;
  ghlToken?: string;
  metaAdAccountId?: string;
  ga4PropertyId?: string;
  googlePlaceId?: string;
}

/**
 * The request body, built from the wizard's answers.
 *
 * Every field here is Jake's technical shell and lands in a column of its own on
 * the tenant. There is no intake half any more: a client stood up by hand has
 * answered nothing, and one who came through the funnel never reaches this form.
 *
 * Empty answers are dropped rather than sent as "". The API reads a blank the
 * same as absent for most of these, but not all (an empty owner email with a
 * password set is an error), and a payload that says only what was actually
 * answered is easier to read in a network tab.
 */
export function buildCreatePayload(values: DraftValues): CreateClientPayload {
  const text = (key: string): string => textValue(values, key);

  const payload: CreateClientPayload = {
    name: text("name"),
    niche: text("niche"),
    slug: text("subdomain"),
  };

  // Same name on both sides, so the list is the keys themselves: every one of
  // these is a wizard field key AND the payload key the API reads it from.
  const optional = [
    "appName",
    "brandColor",
    "brandInitials",
    "wonLabel",
    "valueLabel",
    "websiteUrl",
    "ownerName",
    "ownerEmail",
    "ownerPassword",
    "ghlLocationId",
    "ghlToken",
    "metaAdAccountId",
    "ga4PropertyId",
    "googlePlaceId",
  ] as const satisfies readonly (keyof CreateClientPayload)[];

  for (const key of optional) {
    const value = text(key);
    if (value) payload[key] = value;
  }

  return payload;
}

export function stripSensitive(values: DraftValues): DraftValues {
  const out: DraftValues = { ...values };
  for (const key of SENSITIVE_KEYS) delete out[key];
  return out;
}

// Restoring a draft is not simply the inverse of saving one. Owner email is only
// valid alongside a password, and the password is deliberately never persisted,
// so bringing the email back on its own would fail step 3's pairing rule on
// every single resume. Drop it and let the pair be re-entered together.
export function forRestore(values: DraftValues): DraftValues {
  const out: DraftValues = { ...values };
  delete out.ownerEmail;
  return out;
}
