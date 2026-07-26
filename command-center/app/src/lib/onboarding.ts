// The wizard exports its own ONBOARDING_FIELDS; alias both imports so the two
// field models can sit in one module without shadowing each other.
import {
  ONBOARDING_FIELDS as WIZARD_FIELDS,
  ONBOARDING_STEPS as WIZARD_STEPS,
  type OnboardingField as WizardField,
} from "./clientOnboarding";

export type FieldGroup = "connection" | "business" | "rep" | "calendars";

export interface OnboardingField {
  key: string;
  label: string;
  group: FieldGroup;
  /** GHL custom-value display name this field writes to, or null if stored on the tenant. */
  customValue: string | null;
}

/** The name of the custom value that holds the subaccount's API token (read by the flip webhooks). */
export const LOCATION_TOKEN_CV = "Location API Token";

export const ONBOARDING_FIELDS: OnboardingField[] = [
  // connection (stored on tenants, not custom values)
  { key: "ghl_location_id", label: "GHL Location ID", group: "connection", customValue: null },
  { key: "ghl_token", label: "All-scopes Token", group: "connection", customValue: null },
  // business
  { key: "company_name", label: "Company Name", group: "business", customValue: "Company Name" },
  { key: "company_phone", label: "Company Phone Number", group: "business", customValue: "Company Phone Number" },
  { key: "from_name", label: "From Name", group: "business", customValue: "From Name" },
  { key: "from_email", label: "From Email", group: "business", customValue: "From Email" },
  { key: "review_google_url", label: "Review Google URL", group: "business", customValue: "Review Google URL" },
  { key: "gmb_link", label: "GMB Google Reviews Link", group: "business", customValue: "GMB Google Reviews Link" },
  { key: "review_request_link", label: "Review Request Link", group: "business", customValue: "review request link" },
  { key: "reactivation_offer", label: "Database Reactivation Offer", group: "business", customValue: "Database Reactivation Offer" },
  { key: "reactivation_relevance", label: "Database Reactivation Relevance", group: "business", customValue: "Database Reactivation Relevance" },
  { key: "contest_prize", label: "Custom Contest Prize", group: "business", customValue: "Custom Contest Prize" },
  // rep + internal alerts
  { key: "user_first_name", label: "Rep First Name", group: "rep", customValue: "user first name" },
  { key: "user_full_name", label: "Rep Full Name", group: "rep", customValue: "User Full Name" },
  { key: "user_phone", label: "Rep Personal Phone", group: "rep", customValue: "User Personal Phone Number" },
  { key: "notif_from_name", label: "Internal Notification From Name", group: "rep", customValue: "Internal Notification From Name" },
  { key: "notif_from_email", label: "Internal Notification From Email", group: "rep", customValue: "Internal Notification From Email" },
  { key: "notif_sms", label: "Internal Notification SMS", group: "rep", customValue: "Internal Notification SMS" },
  { key: "to_custom_email", label: "Alerts To Email", group: "rep", customValue: "To Custom Email" },
  { key: "to_custom_number", label: "Alerts To Number", group: "rep", customValue: "To Custom Number" },
  // calendars + confirmation pages
  { key: "intro_call_calendar", label: "Intro Call Calendar", group: "calendars", customValue: "Intro Call Calendar" },
  { key: "second_chance_calendar", label: "Intro Call 2nd Chance Calendar", group: "calendars", customValue: "Intro Call 2nd Chance Calendar" },
  { key: "home_estimate_calendar", label: "Home Estimate Calendar", group: "calendars", customValue: "Home Estimate Calendar" },
  { key: "fb_home_estimate_calendar", label: "Facebook Home Estimate Calendar", group: "calendars", customValue: "Facebook Home Estimate Calendar" },
  { key: "fb_calendar_link", label: "FB Calendar Link", group: "calendars", customValue: "FB Calendar Link" },
  { key: "calendar_link", label: "Calendar Link", group: "calendars", customValue: "Calendar Link" },
  { key: "intro_confirm_website", label: "Intro Call Confirmation Website", group: "calendars", customValue: "Intro Call Confirmation Website" },
  { key: "second_chance_confirm_website", label: "Intro Call 2nd Chance Confirmation Website", group: "calendars", customValue: "Intro Call 2nd Chance Confirmation Website" },
];

export interface ChecklistTask {
  key: string;
  phase: string;
  label: string;
  /** true if the readiness auto-checks can tick this without manual confirmation. */
  auto: boolean;
}

export const CHECKLIST_TASKS: ChecklistTask[] = [
  { key: "provision-values", phase: "GHL Setup", label: "Custom values written to GHL", auto: true },
  { key: "token-connected", phase: "GHL Setup", label: "API token valid + connected", auto: true },
  { key: "calendars-present", phase: "GHL Setup", label: "Calendars exist in subaccount", auto: true },
  { key: "google-calendar", phase: "Connections", label: "Connect Google Calendar (2-way sync)", auto: false },
  { key: "phone", phase: "Connections", label: "Connect phone number / LC Phone", auto: false },
  { key: "email-domain", phase: "Connections", label: "Verify sending email domain", auto: false },
  { key: "assign-user", phase: "Connections", label: "Add + assign the rep to calendars", auto: false },
  { key: "publish-workflows", phase: "Go Live", label: "Publish workflows + activate triggers", auto: false },
  { key: "smoke-test", phase: "Go Live", label: "Book + confirm test, watch title flip", auto: false },
];

// --- The client's own intake answers ----------------------------------------
//
// Steps 4-6 of the new-client wizard are the questionnaire the client fills in
// between payment and the kickoff call (contact + legal, targeting, story).
// Those field definitions already exist in clientOnboarding.ts, so they are
// reused here rather than retyped: add a question to the wizard and it appears
// in the Onboarding tab too. Steps 1-3 are the technical shell Jake fills in and
// already live on the tenant record, so they are deliberately excluded.

export type { WizardField };

/** The first wizard step that belongs to the client rather than to Jake. */
export const FIRST_INTAKE_STEP = 4;

export interface IntakeGroup {
  step: number;
  key: string;
  label: string;
  blurb: string;
  fields: WizardField[];
}

/** The intake questionnaire, grouped by wizard step, in wizard order. */
export function intakeGroups(): IntakeGroup[] {
  return WIZARD_STEPS.filter((s) => s.n >= FIRST_INTAKE_STEP).map((s) => ({
    step: s.n,
    key: s.key,
    label: s.label,
    blurb: s.blurb,
    fields: WIZARD_FIELDS.filter((f) => f.step === s.n),
  }));
}

/** Every intake answer key, flat. The saved intake object is keyed by these. */
export const INTAKE_KEYS: string[] = WIZARD_FIELDS.filter(
  (f) => f.step >= FIRST_INTAKE_STEP,
).map((f) => f.key);

/** How many intake questions carry an answer. Blank strings do not count. */
export function intakeAnswered(intake: Record<string, string>): number {
  return INTAKE_KEYS.filter((k) => (intake[k] ?? "").trim() !== "").length;
}

// --- Checklist shaping -------------------------------------------------------

export interface ChecklistPhase {
  phase: string;
  tasks: ChecklistTask[];
}

/** CHECKLIST_TASKS grouped into its phases, first-seen order preserved. */
export function checklistPhases(): ChecklistPhase[] {
  const out: ChecklistPhase[] = [];
  for (const task of CHECKLIST_TASKS) {
    const existing = out.find((p) => p.phase === task.phase);
    if (existing) existing.tasks.push(task);
    else out.push({ phase: task.phase, tasks: [task] });
  }
  return out;
}

export interface ChecklistProgress {
  done: number;
  total: number;
  pct: number;
}

/**
 * Progress over the real task list, not over whatever rows happen to be saved:
 * a task with no row yet is not done, and a saved row for a task we no longer
 * ship does not inflate the count.
 */
export function checklistProgress(
  states: { taskKey: string; done: boolean }[],
): ChecklistProgress {
  const doneKeys = new Set(states.filter((s) => s.done).map((s) => s.taskKey));
  const total = CHECKLIST_TASKS.length;
  const done = CHECKLIST_TASKS.filter((t) => doneKeys.has(t.key)).length;
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/** The one-line human status for the tab header. */
export function onboardingStage(status: string, progress: ChecklistProgress): string {
  if (progress.done === 0) return "Not started";
  if (progress.done === progress.total) return "Onboarding complete";
  if (status === "provisioned") return "Provisioned, finishing setup";
  return "In progress";
}

export interface GhlCustomValue { id: string; name: string; value?: string }
export interface ProvisionWrite { id: string; name: string; value: string }
export interface ProvisionPlan { writes: ProvisionWrite[]; notFound: string[] }

function indexByName(customValues: GhlCustomValue[]): Map<string, GhlCustomValue> {
  const map = new Map<string, GhlCustomValue>();
  for (const cv of customValues) map.set(cv.name.trim().toLowerCase(), cv);
  return map;
}

export function buildProvisionPlan(
  fields: Record<string, string>,
  customValues: GhlCustomValue[],
  token: string,
): ProvisionPlan {
  const byName = indexByName(customValues);
  const writes: ProvisionWrite[] = [];
  const notFound: string[] = [];

  for (const f of ONBOARDING_FIELDS) {
    if (!f.customValue) continue; // connection fields handled on the tenant
    const value = (fields[f.key] ?? "").trim();
    if (!value) continue; // never overwrite with blank
    const cv = byName.get(f.customValue.toLowerCase());
    if (!cv) { notFound.push(f.customValue); continue; }
    writes.push({ id: cv.id, name: cv.name, value });
  }

  // Always push the token into the Location API Token custom value (the webhooks read it).
  const tokenCv = byName.get(LOCATION_TOKEN_CV.toLowerCase());
  if (token && tokenCv) {
    writes.push({ id: tokenCv.id, name: tokenCv.name, value: token });
  } else if (token && !tokenCv) {
    notFound.push(LOCATION_TOKEN_CV);
  }

  return { writes, notFound };
}

export interface ReadinessInput {
  fields: Record<string, string>;
  customValues: GhlCustomValue[];
  calendarIds: string[];
  tokenValid: boolean;
}
export interface ReadinessCheck { key: string; ok: boolean; detail: string }

export function summarizeReadiness(input: ReadinessInput): ReadinessCheck[] {
  const byName = indexByName(input.customValues);
  const mapped = ONBOARDING_FIELDS.filter((f) => f.customValue);
  const empties = mapped.filter((f) => {
    const cv = byName.get((f.customValue as string).toLowerCase());
    return !cv || !(cv.value ?? "").trim();
  });

  return [
    {
      key: "token",
      ok: input.tokenValid,
      detail: input.tokenValid ? "Token authenticates against GHL" : "Token invalid or missing scope",
    },
    {
      key: "custom_values",
      ok: empties.length === 0,
      detail: empties.length === 0
        ? "All mapped custom values are set"
        : `${empties.length} custom ${empties.length === 1 ? "value is" : "values are"} still blank in GHL`,
    },
    {
      key: "calendars",
      ok: input.calendarIds.length > 0,
      detail: input.calendarIds.length > 0
        ? `${input.calendarIds.length} calendar${input.calendarIds.length === 1 ? "" : "s"} present`
        : "No calendars found in subaccount",
    },
  ];
}
