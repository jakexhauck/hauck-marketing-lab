// The client intake funnel, declared as data.
//
// This is the public form at /onboarding-form: no login, filled in by the client
// themselves between paying and the kickoff call. It carries all sixteen
// questions from Jake's Google Form, plus the three things the form could not
// do: the business basics needed to create an account, the login they choose,
// and a review screen.
//
// THE LEGAL BLOCK ON STEP 2 (legalName, taxId, entityType, contactTitle) exists
// for one reason: A2P 10DLC. A carrier will not register a business texting
// number without the legal name, the EIN, the entity type and the job title of
// the person vouching for it. These were cut once, on the reasoning that a
// brand-new client should not be asked for legal details, and collecting them by
// email afterwards turned out to be the thing that held texting up. Asking once,
// here, is the lesser evil.
//
// All four are OPTIONAL. A client who does not know their EIN off-hand must
// still be able to finish the form; the gap gets caught by the A2P item on their
// setup checklist rather than by a blocked submit button.
//
// The funnel, its validation and its review screen all render from
// INTAKE_FIELDS. Adding a question is one entry here, not a JSX edit in three
// places.
//
// What is deliberately NOT here: subdomain, app name, brand colour and
// initials, won/value labels, GHL location and token, Meta ad account, GA4
// property, Google Place ID. Nine technical fields a client could not answer
// and should never see. They live on the admin side, in clientOnboarding.ts.
// clientAnswerable() and its test are the guard that keeps them off.
//
// See docs/build-plans/client-onboarding-full.md.

import { TIMEZONES } from "./clientOnboarding";

export type IntakeFieldType =
  | "text"
  | "email"
  | "tel"
  | "url"
  | "password"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox";

export interface IntakeOption {
  value: string;
  label: string;
}

export interface IntakeField {
  key: string;
  label: string;
  type: IntakeFieldType;
  step: number;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: IntakeOption[];
  // Lay the field out full-width instead of in the two-column grid.
  wide?: boolean;
}

export interface IntakeStep {
  n: number;
  key: string;
  label: string;
  blurb: string;
}

export const INTAKE_STEPS: IntakeStep[] = [
  {
    n: 1,
    key: "business",
    label: "Your business",
    blurb: "The basics, so we know who we are building for.",
  },
  {
    n: 2,
    key: "contact",
    label: "Contact details",
    blurb: "How we reach you, and what we need to register your phone number.",
  },
  {
    n: 3,
    key: "login",
    label: "Your login",
    blurb: "Choose how you will sign in once your account is ready.",
  },
  {
    n: 4,
    key: "targeting",
    label: "Targeting",
    blurb: "Where your ads run, and how you want to hear about new leads.",
  },
  {
    n: 5,
    key: "story",
    label: "Your story",
    blurb: "What makes you different. This is the raw material for your ads.",
  },
  {
    n: 6,
    key: "assets",
    label: "Assets",
    blurb: "Photos and a logo we can use in your marketing.",
  },
];

export const LAST_INPUT_STEP = INTAKE_STEPS.length;
export const REVIEW_STEP = LAST_INPUT_STEP + 1;

const NOTIFY_OPTIONS: IntakeOption[] = [
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  // Not in the source Google Form, which offered text or email only. Kept
  // because plenty of owners want both and had no way to say so.
  { value: "both", label: "Both" },
];

const ASSET_HELP = "Paste a Google Drive, Dropbox or iCloud link. Make sure it is shared.";

// How the business is registered. The carriers' own list for 10DLC brand
// registration, in their wording, so an answer here transfers to the form Jake
// fills in without a judgement call in between.
const ENTITY_OPTIONS: IntakeOption[] = [
  { value: "llc", label: "LLC" },
  { value: "corporation", label: "Corporation" },
  { value: "sole_proprietor", label: "Sole proprietor" },
  { value: "partnership", label: "Partnership" },
  { value: "non_profit", label: "Non-profit" },
];

export const INTAKE_FIELDS: IntakeField[] = [
  // 1 - Your business
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
    label: "What do you do?",
    type: "text",
    step: 1,
    required: true,
    placeholder: "Roofing & Exteriors",
  },
  {
    key: "websiteUrl",
    label: "Website",
    type: "url",
    step: 1,
    placeholder: "https://willisexteriors.com",
    help: "Leave blank if you do not have one yet.",
  },

  // 2 - Contact details (source form Q1-Q6)
  { key: "contactName", label: "Your name", type: "text", step: 2, required: true },
  { key: "contactEmail", label: "Email", type: "email", step: 2, required: true },
  { key: "contactPhone", label: "Phone", type: "tel", step: 2, required: true },
  {
    key: "timezone",
    label: "Timezone",
    type: "select",
    step: 2,
    required: true,
    options: TIMEZONES,
    help: "This sets the times on your booking calendar, so please get it right.",
  },
  {
    key: "businessAddress",
    label: "Business address",
    type: "textarea",
    step: 2,
    required: true,
    wide: true,
  },
  // The A2P block. Optional on purpose: see the note at the top of this file.
  {
    key: "legalName",
    label: "Legal business name",
    type: "text",
    step: 2,
    placeholder: "Willis Exteriors LLC",
    help: "As registered with the IRS. Often the trading name plus LLC or Inc.",
  },
  {
    key: "taxId",
    label: "Tax ID / EIN",
    type: "text",
    step: 2,
    placeholder: "12-3456789",
    // Plain text, no markup: the admin record renders help through React, which
    // escapes it. The funnel's own copy of this field carries the same sentence
    // plus a link out to an explainer, which is the version a client reads.
    help:
      "We know this one is sensitive. The mobile carriers will not let a business send texts until they have checked it is a real business, and the EIN is how they check. We use it for that registration and nothing else.",
  },
  {
    key: "entityType",
    label: "Business structure",
    type: "select",
    step: 2,
    options: ENTITY_OPTIONS,
  },
  {
    key: "contactTitle",
    label: "Your job title",
    type: "text",
    step: 2,
    placeholder: "Owner",
    help: "The carriers ask who is authorising the registration.",
  },

  // 3 - Your login (new: this is what creates the account)
  {
    key: "loginEmail",
    label: "Login email",
    type: "email",
    step: 3,
    required: true,
    help: "Prefilled from the email above. Change it if you would rather sign in with another.",
  },
  {
    key: "password",
    label: "Choose a password",
    type: "password",
    step: 3,
    required: true,
    help: "At least 8 characters.",
  },
  {
    key: "passwordConfirm",
    label: "Confirm password",
    type: "password",
    step: 3,
    required: true,
  },

  // 4 - Targeting (source form Q7-Q11)
  {
    key: "targetAreas",
    label: "Areas to target for your ads",
    type: "textarea",
    step: 4,
    required: true,
    wide: true,
    placeholder: "78704, Travis County, Downtown Austin, Round Rock",
    help: "Any combination of zip codes, counties, neighbourhoods or cities.",
  },
  {
    key: "areaCallout",
    label: "How should the ads name your area?",
    type: "text",
    step: 4,
    required: true,
    wide: true,
    placeholder: "Detroit area",
    help: '"Westlake County and Surrounding Areas", for example.',
  },
  {
    key: "notifyPreference",
    label: "How would you like to hear about new leads and appointments?",
    type: "radio",
    step: 4,
    options: NOTIFY_OPTIONS,
    wide: true,
  },
  {
    key: "calendarAvailability",
    label: "Your preferred calendar availability",
    type: "textarea",
    step: 4,
    wide: true,
    placeholder: "Mon-Fri 9am-5pm, Saturday 12-3pm, Sunday off",
  },
  {
    key: "leadConnectorInstalled",
    label: "I have installed the LeadConnector app on my phone",
    type: "checkbox",
    step: 4,
    wide: true,
  },

  // 5 - Your story (source form Q12, Q15, Q16)
  {
    key: "usp",
    label: "Do you have a unique selling proposition?",
    type: "textarea",
    step: 5,
    wide: true,
    placeholder: "We guarantee a home sale in 30 days or pay the seller $10k",
  },
  {
    key: "whySignedUp",
    label: "What made you want to work with Hauck Marketing?",
    type: "textarea",
    step: 5,
    wide: true,
  },
  {
    key: "notes",
    label: "Anything else we should know?",
    type: "textarea",
    step: 5,
    wide: true,
  },

  // 6 - Assets (source form Q13-Q14, plus a logo)
  // Links rather than uploads in v1: a public unauthenticated upload endpoint is
  // a storage-bombing target, and the app has no storage bucket yet.
  { key: "logoUrl", label: "Your logo", type: "url", step: 6, wide: true, help: ASSET_HELP },
  {
    key: "headshotUrl",
    label: "A clear headshot of yourself",
    type: "url",
    step: 6,
    wide: true,
    help: ASSET_HELP,
  },
  {
    key: "pastWorkUrl",
    label: "Photos of your past work",
    type: "url",
    step: 6,
    wide: true,
    help: ASSET_HELP,
  },
];

// Everything persistable. Files are not in this funnel at all, so unlike the
// admin wizard there is no in-memory-only half to reconcile.
export type IntakeAnswers = Record<string, string | boolean | undefined>;

// The two fields that never come back down the wire. The password is hashed
// server-side the moment step 3 is saved, so a resumed funnel shows the boxes
// empty with a note saying why.
export const NEVER_RETURNED = ["password", "passwordConfirm"] as const;

export function fieldsForStep(step: number): IntakeField[] {
  return INTAKE_FIELDS.filter((f) => f.step === step);
}

// Whether the client is ever asked this. The nine agency-only keys answer false,
// which is what keeps them off the funnel.
export function clientAnswerable(key: string): boolean {
  return INTAKE_FIELDS.some((f) => f.key === key);
}

function textValue(answers: IntakeAnswers, key: string): string {
  const raw = answers[key];
  return typeof raw === "string" ? raw.trim() : "";
}

export function missingRequired(step: number, answers: IntakeAnswers): IntakeField[] {
  return fieldsForStep(step).filter((f) => f.required && !textValue(answers, f.key));
}

// Deliberately loose: enough to catch a typo, not so strict it rejects a valid
// address. Mirrors the rule in clientOnboarding.ts.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A client will type "willisexteriors.com" without the scheme, so accept that
// and let the caller normalise. What this rejects is something with no dot at
// all, which is a typo rather than a bare domain.
const URL_RE = /^(https?:\/\/)?[^\s.]+(\.[^\s.]+)+(\/\S*)?$/;

export interface StepValidation {
  ok: boolean;
  errors: Record<string, string>;
}

export function validateStep(step: number, answers: IntakeAnswers): StepValidation {
  const errors: Record<string, string> = {};

  for (const field of missingRequired(step, answers)) {
    errors[field.key] = `${field.label} is required`;
  }

  for (const field of fieldsForStep(step)) {
    const value = textValue(answers, field.key);
    if (!value) continue;
    if (field.type === "email" && !EMAIL_RE.test(value)) {
      errors[field.key] = "That does not look like an email address";
    }
    if (field.type === "url" && !URL_RE.test(value)) {
      errors[field.key] = "That does not look like a web address";
    }
  }

  // The login step has rules the field types cannot express. The 8-character
  // floor mirrors POST /api/admin/clients, so a funnel that passes here will not
  // be bounced when the submission is approved.
  if (step === 3) {
    const password = textValue(answers, "password");
    const confirm = textValue(answers, "passwordConfirm");
    if (password && password.length < 8) {
      errors.password = "At least 8 characters";
    }
    if (password && confirm && password !== confirm) {
      errors.passwordConfirm = "The two passwords do not match";
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

// How far through the client is, as a whole percentage of the required fields.
// Optional answers deliberately do not count: a client who fills in every
// required field and skips the optional ones is finished, and a progress bar
// that told them otherwise would be lying.
export function completeness(answers: IntakeAnswers): number {
  const required = INTAKE_FIELDS.filter((f) => f.required);
  if (required.length === 0) return 100;
  const answered = required.filter((f) => textValue(answers, f.key)).length;
  return Math.round((answered / required.length) * 100);
}
