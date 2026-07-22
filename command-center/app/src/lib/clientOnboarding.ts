// The new-client onboarding wizard, declared as data.
//
// Two halves live on one form. Steps 1-3 are the technical shell Jake fills in
// to stand a client up (branding, subdomain, owner login, connections). Steps
// 4-6 are the client intake questionnaire, carried over from the Google Form
// Jake sends between payment and the kickoff call: its job is the GHL
// sub-account, A2P phone verification, and giving the client something to do so
// the engagement keeps momentum.
//
// The wizard, its validation and its review screen all render from
// ONBOARDING_FIELDS. Adding a field is one entry here, not a JSX edit in three
// places. See docs/build-plans/client-onboarding-wizard.md.

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
  | "color"
  | "file";

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
  // File fields only: accept multiple selections (past-work photos).
  multiple?: boolean;
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
  {
    n: 4,
    key: "contact",
    label: "Contact & Legal",
    blurb: "Who we deal with, and what GHL needs for A2P phone registration.",
  },
  {
    n: 5,
    key: "targeting",
    label: "Targeting & Ops",
    blurb: "Where the ads run, and how the client hears about a new lead.",
  },
  {
    n: 6,
    key: "story",
    label: "Story & Assets",
    blurb: "The raw material for ad copy and creative.",
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

const NOTIFY_OPTIONS: FieldOption[] = [
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "both", label: "Both" },
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
  { key: "logo", label: "Logo", type: "file", step: 2 },
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

  // 4 - Contact & Legal
  { key: "contactName", label: "Contact name", type: "text", step: 4, required: true },
  { key: "contactEmail", label: "Email", type: "email", step: 4, required: true },
  { key: "contactPhone", label: "Phone", type: "tel", step: 4, required: true },
  {
    key: "timezone",
    label: "Timezone",
    type: "select",
    step: 4,
    required: true,
    options: TIMEZONES,
    help: "Drives the client's booking calendar. Get this right.",
  },
  {
    key: "businessAddress",
    label: "Business address",
    type: "textarea",
    step: 4,
    required: true,
    wide: true,
  },
  {
    key: "taxId",
    label: "Tax ID / EIN",
    type: "text",
    step: 4,
    help: "Needed to register a phone number for A2P. Never written to the saved draft.",
  },

  // 5 - Targeting & Ops
  {
    key: "targetAreas",
    label: "Areas to target for the ads",
    type: "textarea",
    step: 5,
    required: true,
    wide: true,
    placeholder: "78704, Travis County, Downtown Austin, Round Rock",
    help: "Any combination of zip codes, counties, neighbourhoods or cities.",
  },
  {
    key: "areaCallout",
    label: "Area callout",
    type: "text",
    step: 5,
    required: true,
    wide: true,
    placeholder: "Detroit area",
    help: 'How the ads name the area. "Westlake County and Surrounding Areas".',
  },
  {
    key: "notifyPreference",
    label: "How they want new leads and appointments",
    type: "radio",
    step: 5,
    options: NOTIFY_OPTIONS,
    wide: true,
  },
  {
    key: "calendarAvailability",
    label: "Preferred calendar availability",
    type: "textarea",
    step: 5,
    wide: true,
    placeholder: "Mon-Fri 9am-5pm, Saturday 12-3pm, Sunday off",
  },
  {
    key: "leadConnectorInstalled",
    label: "LeadConnector app installed on their phone",
    type: "checkbox",
    step: 5,
    wide: true,
  },

  // 6 - Story & Assets
  {
    key: "usp",
    label: "Unique selling proposition",
    type: "textarea",
    step: 6,
    wide: true,
    placeholder: "We guarantee a home sale in 30 days or pay the seller $10k",
  },
  {
    key: "whySignedUp",
    label: "Why they signed with Hauck Marketing",
    type: "textarea",
    step: 6,
    wide: true,
    help: "Their own words. Good testimonial and ad-copy material.",
  },
  {
    key: "notes",
    label: "Anything else we should know",
    type: "textarea",
    step: 6,
    wide: true,
  },
  {
    key: "headshot",
    label: "Headshot",
    type: "file",
    step: 6,
    help: "A clear one, for use in marketing assets.",
  },
  {
    key: "pastWorkPhotos",
    label: "Photos of past work",
    type: "file",
    step: 6,
    multiple: true,
  },
];

// A password, an API token and a tax ID have no business sitting in a
// JS-readable store on a shared machine. These three are stripped before the
// draft is written to localStorage, so they survive a step change (React state)
// but not a refresh. Each one says so in its own help text.
export const SENSITIVE_KEYS = ["ownerPassword", "ghlToken", "taxId"] as const;

// File values never serialise and never reach the draft; they live in the
// wizard's own state. This type covers only what is persistable.
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
