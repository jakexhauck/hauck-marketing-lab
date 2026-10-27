// The client intake funnel, declared as data.
//
// This is the public form at /onboarding-form: no login, filled in by the client
// themselves between paying and the kickoff call. It grew out of Jake's Google
// Form and still asks most of it, plus the three things that form could not do:
// the business basics needed to create an account, the login they choose, and a
// review screen.
//
// Where it now differs from the Google Form, it differs on purpose: no address,
// targeting asks for zip codes rather than "areas", hours are asked a day at a
// time, and the notification-preference and LeadConnector questions are gone.
// Each is noted at the question it replaced.
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

// Headings, order and questions are Jake's list (2026-10-27). No sub-text under
// a heading (his rule), except Assets, where he asked for the line: a client
// without their photos to hand should send the form anyway, not stall on it.
export const INTAKE_STEPS: IntakeStep[] = [
  { n: 1, key: "business", label: "Business", blurb: "" },
  { n: 2, key: "contact", label: "Contact", blurb: "" },
  // Not on Jake's list, and kept on purpose: sending the form creates the
  // client's account from this password (approvalBlocker refuses one without).
  // It stays step 3 because both this file and the funnel key the password rule
  // to "step 3" by number.
  { n: 3, key: "login", label: "Login", blurb: "" },
  { n: 4, key: "targeting", label: "Targeting", blurb: "" },
  { n: 5, key: "hours", label: "Working hours", blurb: "" },
  { n: 6, key: "services", label: "Services", blurb: "" },
  { n: 7, key: "numbers", label: "Numbers", blurb: "" },
  { n: 8, key: "story", label: "Story", blurb: "" },
  {
    n: 9,
    key: "assets",
    label: "Assets",
    blurb: "All optional. If you do not have these ready, just submit the form and we can go over them on your onboarding call.",
  },
];

export const LAST_INPUT_STEP = INTAKE_STEPS.length;
export const REVIEW_STEP = LAST_INPUT_STEP + 1;

// The source Google Form asked how they wanted to hear about new leads (text,
// email or both). It is gone: leads reach a client by SMS and in the app, and
// asking a question whose answer changes nothing invites an answer we cannot
// honour.

const ASSET_HELP = "A Google Drive, Dropbox or iCloud link, set so anyone with the link can view it.";

// --- Services -----------------------------------------------------------------
//
// One box per service rather than one box listing them all. A comma-separated
// sentence has to be split by hand before anything can be built from it, and
// the split is a guess: "landscaping, design and build" is either two services
// or three. The first is required; the funnel opens the rest one at a time
// ("Add another service"), up to SERVICE_SLOTS, which the funnel's own
// SERVICE_SLOTS must match (intakeFunnelParity.test.ts).

export const SERVICE_SLOTS = 6;

const SERVICE_PLACEHOLDERS = [
  "Paver patios",
  "Retaining walls",
  "Landscape design",
  "Lawn maintenance",
  "Drainage",
  "Snow removal",
];

function serviceField(n: number): IntakeField {
  return {
    key: `service${n}`,
    label: `Service ${n}`,
    type: "text",
    step: 6,
    required: n === 1,
    wide: true,
    placeholder: SERVICE_PLACEHOLDERS[n - 1],
    ...(n === 1 ? { help: "One service per box, named the way your customers ask for it." } : {}),
  };
}

// --- Jobs and their numbers ---------------------------------------------------
//
// A contractor's jobs do not share a price: a roof replacement and a roof repair
// are different tickets with different margins, so one "average ticket" box
// averages two things that should never be averaged. Each job type gets its own
// row of three instead. The first row is required, because the KPI targets in
// Mission Control are built from it; the funnel opens the rest one at a time
// ("Add another job type"), up to JOB_SLOTS. The funnel's own JOB_SLOTS must
// match (intakeFunnelParity.test.ts).
//
// Text rather than number fields: clients type "$15,000", "15k" or "about 12
// to 18 thousand", and every one of those is an answer worth keeping as given.

export const JOB_SLOTS = 5;

const JOB_PLACEHOLDERS: [string, string][] = [
  ["Roof replacement", "$15,000"],
  ["Roof repair", "$900"],
  ["Gutters", "$2,500"],
  ["Siding", "$18,000"],
  ["Windows", "$9,000"],
];

function jobFields(n: number): IntakeField[] {
  const [job, ticket] = JOB_PLACEHOLDERS[n - 1];
  const required = n === 1;
  return [
    { key: `jobType${n}`, label: `Job type ${n}`, type: "text", step: 7, required, wide: true, placeholder: job },
    { key: `jobTicket${n}`, label: `Job ${n} average ticket`, type: "text", step: 7, required, placeholder: ticket },
    { key: `jobMargin${n}`, label: `Job ${n} margin`, type: "text", step: 7, required, placeholder: "35%" },
  ];
}

// Out of ten rather than a percentage: "4 out of 10" is how an owner counts,
// and a free-typed percentage comes back as "pretty good".
const CLOSE_RATES: IntakeOption[] = Array.from({ length: 11 }, (_, n) => ({
  value: String(n),
  label: `${n} out of 10`,
}));

// --- The password rule -------------------------------------------------------
//
// This account is the client's way into their own business data, and it is
// chosen once, on a public form, by somebody who will never think about it
// again. So the rule is stated up front on the field rather than sprung on them
// as an error, and it is enforced on the SERVER as well as in the funnel: a
// rule that only lives in the browser is a suggestion.
//
// Deliberately STRICTER than the eight-character floor the admin-side staff and
// owner forms use. Those are Jake typing a password for somebody he is on the
// phone with; this is a stranger choosing their own.

export const MIN_PASSWORD_LEN = 12;

/** The rule as the client reads it, one line per requirement. */
export const PASSWORD_RULES: string[] = [
  "Include both upper and lower case characters",
  "Include at least one symbol and number",
  `Be at least ${MIN_PASSWORD_LEN} characters long`,
];

// A symbol is anything that is not a letter, a number or a space. Defined by
// exclusion on purpose: an allow-list of punctuation always misses the one
// character somebody actually typed.
const HAS_LOWER = /[a-z]/;
const HAS_UPPER = /[A-Z]/;
const HAS_NUMBER = /[0-9]/;
const HAS_SYMBOL = /[^a-zA-Z0-9\s]/;

/**
 * Every rule this password breaks, in the order the form lists them. Empty
 * means it passes. The funnel shows the first one; the server rejects on any.
 */
export function passwordProblems(password: string): string[] {
  const problems: string[] = [];
  if (!HAS_LOWER.test(password) || !HAS_UPPER.test(password)) {
    problems.push("Use both upper and lower case characters");
  }
  if (!HAS_NUMBER.test(password) || !HAS_SYMBOL.test(password)) {
    problems.push("Use at least one symbol and one number");
  }
  if (password.length < MIN_PASSWORD_LEN) {
    problems.push(`Use at least ${MIN_PASSWORD_LEN} characters`);
  }
  return problems;
}

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

  // 2 - Contact (source form Q1-Q6)
  { key: "contactName", label: "Owner name", type: "text", step: 2, required: true },
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
  // No address (Jake, 2026-10-27: "we dont need that"). Older answers still
  // carry address* keys, which the GHL setup, the client facts and the brief
  // still read, so a client who gave one keeps it.

  // 3 - Login (new: this is what creates the account)
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
    // Plain text here (the admin record escapes help); the funnel's own copy
    // renders the same three rules as a list.
    help: `Your password needs to: ${PASSWORD_RULES.join("; ").toLowerCase()}.`,
  },
  {
    key: "passwordConfirm",
    label: "Confirm password",
    type: "password",
    step: 3,
    required: true,
  },

  // 4 - Targeting (source form Q7-Q11)
  //
  // Zip codes, not "areas". The old question took any mix of counties,
  // neighbourhoods and cities, and every answer then had to be turned into zip
  // codes by hand before the ad set could be built. Asking for the thing we
  // actually type in saves that round trip and the guesswork in it.
  {
    key: "targetZips",
    label: "Zip codes",
    type: "textarea",
    step: 4,
    required: true,
    wide: true,
    placeholder: "48135, 48150, 48154, 48185",
    help: "Zip codes only please, separated by commas. If you are not sure which ones cover your area, put the ones you work in most and we will build out from there.",
  },
  {
    key: "areaCallout",
    label: "Area call-out",
    type: "text",
    step: 4,
    required: true,
    wide: true,
    placeholder: "Metro Detroit",
    help: 'This is what the ad calls the people it is shown to: "Metro Detroit Homeowners...". Give us the name locals actually use.',
  },
  // 5 - Working hours, a day at a time. Not a promise and not their real
  // calendar: it is the shape of a normal week, so the booking calendar starts
  // somewhere sensible instead of nine-to-five on a day they never work. A
  // blank day is a day off, which is why none of these are required.
  {
    key: "hoursMonday",
    label: "Monday",
    type: "text",
    step: 5,
    placeholder: "9am - 5pm",
    help: "Your ideal hours, not a commitment. Leave a day blank to take it off.",
  },
  { key: "hoursTuesday", label: "Tuesday", type: "text", step: 5, placeholder: "9am - 5pm" },
  { key: "hoursWednesday", label: "Wednesday", type: "text", step: 5, placeholder: "9am - 5pm" },
  { key: "hoursThursday", label: "Thursday", type: "text", step: 5, placeholder: "9am - 5pm" },
  { key: "hoursFriday", label: "Friday", type: "text", step: 5, placeholder: "9am - 5pm" },
  { key: "hoursSaturday", label: "Saturday", type: "text", step: 5, placeholder: "10am - 2pm" },
  { key: "hoursSunday", label: "Sunday", type: "text", step: 5, placeholder: "Closed" },

  // 6 - Services
  ...Array.from({ length: SERVICE_SLOTS }, (_, i) => serviceField(i + 1)),

  // 7 - Numbers (Mission Control's Target KPIs and Market Research)
  ...Array.from({ length: JOB_SLOTS }, (_, i) => jobFields(i + 1)).flat(),
  {
    key: "closeRate",
    label: "Estimated close rate",
    type: "select",
    step: 7,
    required: true,
    wide: true,
    options: CLOSE_RATES,
  },

  // 8 - Story (source form Q12, Q15, Q16, plus Mission Control's Local
  // Competitors and Offer). None required: not every business has run an offer
  // or can name its competitors. Best customer was asked here until Jake's
  // 2026-10-27 list left it out.
  {
    key: "competitors",
    label: "Local competitors",
    type: "textarea",
    step: 8,
    wide: true,
    placeholder: "Renewal by Andersen, Detroit Roofing Co, Smith & Sons",
  },
  {
    key: "pastOffers",
    label: "Past offers",
    type: "textarea",
    step: 8,
    wide: true,
    placeholder: "Free gutter guards with a new roof, $500 off in the spring, 0% financing for 12 months",
  },
  {
    key: "usp",
    label: "What makes your company unique?",
    type: "textarea",
    step: 8,
    wide: true,
    placeholder: "We guarantee a home sale in 30 days or pay the seller $10k",
  },
  {
    key: "whySignedUp",
    label: "Why did you sign up?",
    type: "textarea",
    step: 8,
    wide: true,
  },
  {
    key: "notes",
    label: "Anything else?",
    type: "textarea",
    step: 8,
    wide: true,
  },

  // 9 - Assets (source form Q13-Q14, plus a logo)
  // Links rather than uploads in v1: a public unauthenticated upload endpoint is
  // a storage-bombing target, and the app has no storage bucket yet.
  //
  // All three optional, and the step's line says so. Sharing a Drive folder is
  // not obvious if you have never done it, and a client stuck on a required
  // field they cannot fill abandons the form rather than asking. The funnel's
  // copy of ASSET_HELP renders the "anyone with the link" part as HTML so it can
  // be emphasised; this one is plain text, for the admin record.
  { key: "logoUrl", label: "Logo", type: "url", step: 9, wide: true, help: ASSET_HELP },
  { key: "headshotUrl", label: "Headshot", type: "url", step: 9, wide: true, help: ASSET_HELP },
  { key: "pastWorkUrl", label: "Past work photos", type: "url", step: 9, wide: true, help: ASSET_HELP },
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

  // The login step has rules the field types cannot express. Same rule the
  // server enforces (passwordProblems), so a funnel that passes here is never
  // bounced by the API afterwards.
  if (step === 3) {
    const password = textValue(answers, "password");
    const confirm = textValue(answers, "passwordConfirm");
    const problems = password ? passwordProblems(password) : [];
    if (problems.length > 0) {
      // One at a time. A field that lists three faults at once reads as a
      // telling-off; fixing them one by one reads as progress.
      errors.password = problems[0];
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
