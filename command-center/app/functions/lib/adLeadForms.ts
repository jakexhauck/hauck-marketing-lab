// Lead forms: the shape, the cleaning, and the text that gets pasted (0090, 0099).
//
// A draft of a Meta Instant Form, and since 0099 a COMPLETE one: every section
// Meta's builder asks for has a box here, in Meta's own order. Nothing in this
// file talks to Meta; the output is text on a clipboard. Shared by the two
// endpoints that write ad_lead_forms and imported for its types by the browser,
// so the editor and the server cannot disagree about what a form is.
//
// Every field is plain text and is rendered as text. The cleaners are the whole
// trust boundary: they cap length and flatten control characters, exactly as
// adWorkspace.ts does. No HTML, no markdown, no sanitizer.

import { cleanBlock, cleanLine, cleanUrl } from "./adWorkspace";

// Meta's three form types. Recorded rather than acted on: it changes nothing
// here and exists so the paste is a complete instruction.
export type LeadFormIntent = "more_volume" | "higher_intent" | "rich_creative";

export const LEAD_FORM_INTENTS: LeadFormIntent[] = [
  "more_volume",
  "higher_intent",
  "rich_creative",
];

export function isLeadFormIntent(value: unknown): value is LeadFormIntent {
  return LEAD_FORM_INTENTS.includes(value as LeadFormIntent);
}

export const INTENT_LABEL: Record<LeadFormIntent, string> = {
  more_volume: "More volume",
  higher_intent: "Higher intent",
  rich_creative: "Rich creative",
};

// What each type actually costs, said once here so the editor and the paste
// agree. Higher intent buys a confirmation step and gives up placements for it.
export const INTENT_NOTE: Record<LeadFormIntent, string> = {
  more_volume: "One screen, every placement",
  higher_intent: "Adds a review step, mobile feeds only",
  rich_creative: "Branded layout, Facebook app only",
};

// How Meta draws the intro description.
export type IntroLayout = "paragraph" | "list";

export function isIntroLayout(value: unknown): value is IntroLayout {
  return value === "paragraph" || value === "list";
}

// Meta's form sharing setting. Restricted keeps the form to this advertiser.
export type FormSharing = "restricted" | "open";

export function isFormSharing(value: unknown): value is FormSharing {
  return value === "restricted" || value === "open";
}

// prefill  = Meta fills it from the profile.
// short    = a typed answer.
// choice   = multiple choice, and the only kind another question can branch on.
// appointment  = Meta's appointment request, a date and time picker.
// store_locator = Meta's store lookup, which offers the nearest locations.
export type LeadQuestionKind = "prefill" | "short" | "choice" | "appointment" | "store_locator";

export const LEAD_QUESTION_KINDS: LeadQuestionKind[] = [
  "prefill",
  "short",
  "choice",
  "appointment",
  "store_locator",
];

export function isLeadQuestionKind(value: unknown): value is LeadQuestionKind {
  return LEAD_QUESTION_KINDS.includes(value as LeadQuestionKind);
}

export const KIND_LABEL: Record<LeadQuestionKind, string> = {
  prefill: "Prefill",
  short: "Short answer",
  choice: "Multiple choice",
  appointment: "Appointment request",
  store_locator: "Store locator",
};

// The completion button's KIND. Each one changes what the field beside it
// means, which is why it is not free text: view_website and download take a
// URL, call_business takes a phone number, the other two take neither.
export type CompletionCta =
  | "view_website"
  | "download"
  | "call_business"
  | "message_business"
  | "view_on_facebook";

export const COMPLETION_CTAS: CompletionCta[] = [
  "view_website",
  "download",
  "call_business",
  "message_business",
  "view_on_facebook",
];

export function isCompletionCta(value: unknown): value is CompletionCta {
  return COMPLETION_CTAS.includes(value as CompletionCta);
}

export const COMPLETION_CTA_LABELS: Record<CompletionCta, string> = {
  view_website: "View website",
  download: "Download",
  call_business: "Call business",
  message_business: "Message business",
  view_on_facebook: "View on Facebook",
};

// What the button needs beside it. The editor asks for exactly this and nothing
// else, and the paste prints exactly this.
export function ctaNeeds(cta: CompletionCta): "url" | "phone" | "none" {
  if (cta === "view_website" || cta === "download") return "url";
  if (cta === "call_business") return "phone";
  return "none";
}

export interface LeadQuestionOption {
  label: string;
  // The answer that ends the form as a bad fit. Meta has no such flag, so this
  // is drafting intent: it prints in the paste-out as a note to whoever builds
  // the form, and drives nothing on its own.
  disqualify: boolean;
}

export interface LeadQuestion {
  // Stable and local ("q1"). Exists so showIf can name a question without
  // using its index, which moves whenever the list is reordered.
  id: string;
  kind: LeadQuestionKind;
  label: string;
  // Meta's "field name": the key this answer arrives under in the CRM. Blank
  // means Meta will derive one from the label, which is what defaultFieldName
  // shows in the box as a placeholder.
  fieldName: string;
  // Which profile field, when kind is prefill. Free text; the UI suggests
  // Meta's list but Meta keeps adding to it.
  prefill: string;
  // Meta lets a question be skippable. False is the normal state.
  optional: boolean;
  // choice only: more than one answer may be picked.
  multiSelect: boolean;
  // short only. 0 means unset, which is why they are not nullable: a number
  // that is sometimes absent is a number every reader has to guard.
  minLength: number;
  maxLength: number;
  // The small print under an appointment picker or a store lookup.
  inlineContext: string;
  // choice only.
  options: LeadQuestionOption[];
  // Meta's conditional question: asked only when an earlier choice was given.
  // One antecedent, one value, because that is all Meta can express.
  //
  // THE LIST STAYS FLAT. Meta's builder presents branching as a "conditional
  // question" owning its follow-ups; storing it that way would mean rewriting a
  // tree every time a question moves. A follow-up is an ordinary question
  // carrying a showIf, and the editor draws it indented under its answer.
  showIf: { questionId: string; optionLabel: string } | null;
}

// One of Meta's consent checkboxes.
export interface Consent {
  text: string;
  optional: boolean;
}

// One of Meta's tracking parameters, which comes back attached to every lead.
export interface TrackingParam {
  key: string;
  value: string;
}

export interface LeadForm {
  id: string;
  tenantId: string;
  name: string;
  intent: LeadFormIntent;

  introImageUrl: string;
  introHeadline: string;
  introDescription: string;
  introLayout: IntroLayout;

  questions: LeadQuestion[];

  privacyUrl: string;
  privacyLinkText: string;
  disclaimerTitle: string;
  privacyDisclaimer: string;
  consents: Consent[];

  completionHeadline: string;
  completionBody: string;
  completionCtaType: CompletionCta;
  completionCta: string;
  completionUrl: string;
  completionPhone: string;

  locale: string;
  sharing: FormSharing;
  trackingParams: TrackingParam[];

  createdAt: string;
  updatedAt: string;
}

export const FORM_LIMITS = {
  name: 120,
  introHeadline: 200,
  introDescription: 2000,
  questionLabel: 300,
  prefill: 60,
  fieldName: 60,
  inlineContext: 200,
  optionLabel: 200,
  options: 20,
  questions: 40,
  disclaimerTitle: 200,
  disclaimer: 2000,
  privacyLinkText: 80,
  consentText: 1000,
  consents: 5,
  completionHeadline: 200,
  completionBody: 2000,
  completionCta: 60,
  completionPhone: 40,
  locale: 40,
  trackingKey: 60,
  trackingValue: 200,
  trackingParams: 10,
  questionId: 20,
  // Short-answer validation. Meta's own ceiling on a typed answer.
  answerLength: 500,
} as const;

// Meta's own cap on a form. Not enforced, because Meta moves it and counts
// conditional follow-ups its own way: the editor SAYS it and lets the draft go
// over, which is the honest version of a number we do not own.
export const META_QUESTION_GUIDE = 15;

// Meta's prefill fields, offered in the editor grouped exactly as Meta groups
// them. Not enforced: the box takes any text, because this list is Meta's and
// it grows.
export const PREFILL_GROUPS: { label: string; fields: string[] }[] = [
  {
    label: "Contact fields",
    fields: [
      "Email",
      "Phone number",
      "Full name",
      "First name",
      "Last name",
      "Street address",
      "City",
      "State",
      "Province",
      "Zip code",
      "Post code",
      "Country",
    ],
  },
  {
    label: "User information",
    fields: [
      "Date of birth",
      "Gender",
      "Marital status",
      "Relationship status",
      "Military status",
    ],
  },
  {
    label: "Work information",
    fields: ["Job title", "Work email", "Work phone number", "Company name", "Company size"],
  },
  {
    label: "National ID",
    fields: [
      "Argentina DNI",
      "Brazil CPF",
      "Chile RUT",
      "Colombia CC",
      "Ecuador CI",
      "Peru DNI",
    ],
  },
];

export const PREFILL_SUGGESTIONS = PREFILL_GROUPS.flatMap((g) => g.fields);

// What Meta would call this field if nobody named it. Shown as the placeholder
// in the field-name box so the key is visible before it matters, rather than
// discovered as a column of nulls a week after launch.
export function defaultFieldName(question: Pick<LeadQuestion, "kind" | "label" | "prefill">): string {
  const source = question.kind === "prefill" ? question.prefill || question.label : question.label;
  const key = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, FORM_LIMITS.fieldName);
  return key;
}

// A question id: short, and safe to print inside the paste-out. Anything else
// is dropped and the question is re-stamped by the caller.
function cleanQuestionId(value: unknown): string {
  if (typeof value !== "string") return "";
  const id = value.trim().slice(0, FORM_LIMITS.questionId);
  return /^[A-Za-z0-9_-]+$/.test(id) ? id : "";
}

// A field name is a KEY, so it is narrowed rather than merely trimmed: anything
// that is not a letter, a digit or an underscore becomes an underscore, which
// is what Meta does to a typed one anyway.
export function cleanFieldName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, FORM_LIMITS.fieldName);
}

// A length bound. Out of range or not a number means unset, which is 0.
function cleanLength(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  const whole = Math.floor(n);
  if (whole <= 0) return 0;
  return Math.min(whole, FORM_LIMITS.answerLength);
}

export function cleanOptions(value: unknown): LeadQuestionOption[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, FORM_LIMITS.options)
    .map((raw) => {
      const row = (raw ?? {}) as Record<string, unknown>;
      return {
        label: cleanLine(row.label, FORM_LIMITS.optionLabel),
        disqualify: row.disqualify === true,
      };
    })
    .filter((o) => o.label);
}

export function cleanConsents(value: unknown): Consent[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, FORM_LIMITS.consents)
    .map((raw) => {
      const row = (raw ?? {}) as Record<string, unknown>;
      return {
        text: cleanBlock(row.text, FORM_LIMITS.consentText),
        optional: row.optional === true,
      };
    })
    .filter((c) => c.text);
}

export function cleanTrackingParams(value: unknown): TrackingParam[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, FORM_LIMITS.trackingParams)
    .map((raw) => {
      const row = (raw ?? {}) as Record<string, unknown>;
      return {
        key: cleanFieldName(row.key).slice(0, FORM_LIMITS.trackingKey),
        value: cleanLine(row.value, FORM_LIMITS.trackingValue),
      };
    })
    // A value with no key cannot be sent anywhere. A key with no value is a
    // parameter still being filled in and is kept.
    .filter((p) => p.key);
}

export function cleanQuestions(value: unknown): LeadQuestion[] {
  if (!Array.isArray(value)) return [];

  const questions = value.slice(0, FORM_LIMITS.questions).map((raw, i) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    const kind: LeadQuestionKind = isLeadQuestionKind(row.kind) ? row.kind : "short";
    // A blank or malformed id is re-stamped from the position rather than left
    // empty: an unnamed question cannot be branched to.
    const id = cleanQuestionId(row.id) || `q${i + 1}`;
    return {
      id,
      kind,
      label: cleanLine(row.label, FORM_LIMITS.questionLabel),
      fieldName: cleanFieldName(row.fieldName),
      prefill: kind === "prefill" ? cleanLine(row.prefill, FORM_LIMITS.prefill) : "",
      optional: row.optional === true,
      // Only a choice can be multi-select, and only a short answer has bounds.
      // Kept off the other kinds so a question switched between them does not
      // carry a setting nothing shows.
      multiSelect: kind === "choice" && row.multiSelect === true,
      minLength: kind === "short" ? cleanLength(row.minLength) : 0,
      maxLength: kind === "short" ? cleanLength(row.maxLength) : 0,
      inlineContext:
        kind === "appointment" || kind === "store_locator"
          ? cleanLine(row.inlineContext, FORM_LIMITS.inlineContext)
          : "",
      // Options only mean anything on a choice. Kept off the other kinds so a
      // question switched from choice to short does not carry a hidden list.
      options: kind === "choice" ? cleanOptions(row.options) : [],
      showIf: readShowIf(row.showIf),
    };
  });

  // A minimum above the maximum can never be satisfied, so the pair is dropped
  // rather than stored as a question nobody can answer.
  for (const q of questions) {
    if (q.minLength && q.maxLength && q.minLength > q.maxLength) {
      q.minLength = 0;
      q.maxLength = 0;
    }
  }

  // Duplicate ids would make showIf ambiguous. Later duplicates are re-stamped.
  const seen = new Set<string>();
  for (const q of questions) {
    if (seen.has(q.id)) {
      let n = 1;
      while (seen.has(`${q.id}_${n}`)) n += 1;
      q.id = `${q.id}_${n}`;
    }
    seen.add(q.id);
  }

  // A rule may only point BACKWARDS, at a choice question that exists. Meta
  // cannot ask a question conditional on an answer it has not collected yet,
  // and a rule naming a deleted question would hide its own question forever.
  const choiceBefore = new Map<string, Set<string>>();
  for (const q of questions) {
    if (q.showIf) {
      const opts = choiceBefore.get(q.showIf.questionId);
      if (!opts || !opts.has(q.showIf.optionLabel)) q.showIf = null;
    }
    if (q.kind === "choice") {
      choiceBefore.set(q.id, new Set(q.options.map((o) => o.label)));
    }
  }

  // A question with no text and nothing chosen is an Add nobody filled in. An
  // appointment or a store locator has no text of its own to write, so it
  // survives on its kind alone.
  return questions.filter(
    (q) =>
      q.label ||
      q.prefill ||
      q.options.length ||
      q.kind === "appointment" ||
      q.kind === "store_locator",
  );
}

function readShowIf(value: unknown): LeadQuestion["showIf"] {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const questionId = cleanQuestionId(row.questionId);
  const optionLabel = cleanLine(row.optionLabel, FORM_LIMITS.optionLabel);
  if (!questionId || !optionLabel) return null;
  return { questionId, optionLabel };
}

// The database row, as selected.
export interface LeadFormRow {
  id: string;
  tenant_id: string;
  name: string;
  intent: string;
  intro_image_url: string;
  intro_headline: string;
  intro_description: string;
  intro_layout: string;
  questions: unknown;
  privacy_url: string;
  privacy_link_text: string;
  disclaimer_title: string;
  privacy_disclaimer: string;
  consents: unknown;
  completion_headline: string;
  completion_body: string;
  completion_cta_type: string;
  completion_cta: string;
  completion_url: string;
  completion_phone: string;
  locale: string;
  sharing: string;
  tracking_params: unknown;
  created_at: string;
  updated_at: string;
}

export const LEAD_FORM_SELECT =
  "id, tenant_id, name, intent, intro_image_url, intro_headline, intro_description, " +
  "intro_layout, questions, privacy_url, privacy_link_text, disclaimer_title, " +
  "privacy_disclaimer, consents, completion_headline, completion_body, " +
  "completion_cta_type, completion_cta, completion_url, completion_phone, " +
  "locale, sharing, tracking_params, created_at, updated_at";

export function toLeadForm(row: LeadFormRow): LeadForm {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    intent: isLeadFormIntent(row.intent) ? row.intent : "more_volume",

    introImageUrl: row.intro_image_url ?? "",
    introHeadline: row.intro_headline,
    introDescription: row.intro_description,
    introLayout: isIntroLayout(row.intro_layout) ? row.intro_layout : "paragraph",

    questions: cleanQuestions(row.questions),

    privacyUrl: row.privacy_url,
    privacyLinkText: row.privacy_link_text ?? "",
    disclaimerTitle: row.disclaimer_title ?? "",
    privacyDisclaimer: row.privacy_disclaimer,
    consents: cleanConsents(row.consents),

    completionHeadline: row.completion_headline,
    completionBody: row.completion_body,
    completionCtaType: isCompletionCta(row.completion_cta_type)
      ? row.completion_cta_type
      : "view_website",
    completionCta: row.completion_cta,
    completionUrl: row.completion_url,
    completionPhone: row.completion_phone ?? "",

    locale: row.locale ?? "",
    sharing: isFormSharing(row.sharing) ? row.sharing : "restricted",
    trackingParams: cleanTrackingParams(row.tracking_params),

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface LeadFormPatch {
  name?: string;
  intent?: string;
  introImageUrl?: string;
  introHeadline?: string;
  introDescription?: string;
  introLayout?: string;
  questions?: LeadQuestion[];
  privacyUrl?: string;
  privacyLinkText?: string;
  disclaimerTitle?: string;
  privacyDisclaimer?: string;
  consents?: Consent[];
  completionHeadline?: string;
  completionBody?: string;
  completionCtaType?: string;
  completionCta?: string;
  completionUrl?: string;
  completionPhone?: string;
  locale?: string;
  sharing?: string;
  trackingParams?: TrackingParam[];
}

// Only the keys the body actually named, so an absent key is left alone. Same
// contract as patchColumns in adWorkspace.ts: the editor saves one block at a
// time as it is left.
export function formPatchColumns(body: LeadFormPatch): Record<string, unknown> {
  const u: Record<string, unknown> = {};

  if (body.name !== undefined) u.name = cleanLine(body.name, FORM_LIMITS.name);
  // An unrecognised value on any of these is ignored rather than defaulted, or
  // a typo in a hand-made request would quietly flip a form back to More volume.
  if (body.intent !== undefined && isLeadFormIntent(body.intent)) u.intent = body.intent;
  if (body.introLayout !== undefined && isIntroLayout(body.introLayout)) {
    u.intro_layout = body.introLayout;
  }
  if (body.sharing !== undefined && isFormSharing(body.sharing)) u.sharing = body.sharing;
  if (body.completionCtaType !== undefined && isCompletionCta(body.completionCtaType)) {
    u.completion_cta_type = body.completionCtaType;
  }

  if (body.introImageUrl !== undefined) u.intro_image_url = cleanUrl(body.introImageUrl);
  if (body.introHeadline !== undefined) {
    u.intro_headline = cleanLine(body.introHeadline, FORM_LIMITS.introHeadline);
  }
  if (body.introDescription !== undefined) {
    u.intro_description = cleanBlock(body.introDescription, FORM_LIMITS.introDescription);
  }

  if (body.questions !== undefined) u.questions = cleanQuestions(body.questions);

  if (body.privacyUrl !== undefined) u.privacy_url = cleanUrl(body.privacyUrl);
  if (body.privacyLinkText !== undefined) {
    u.privacy_link_text = cleanLine(body.privacyLinkText, FORM_LIMITS.privacyLinkText);
  }
  if (body.disclaimerTitle !== undefined) {
    u.disclaimer_title = cleanLine(body.disclaimerTitle, FORM_LIMITS.disclaimerTitle);
  }
  if (body.privacyDisclaimer !== undefined) {
    u.privacy_disclaimer = cleanBlock(body.privacyDisclaimer, FORM_LIMITS.disclaimer);
  }
  if (body.consents !== undefined) u.consents = cleanConsents(body.consents);

  if (body.completionHeadline !== undefined) {
    u.completion_headline = cleanLine(body.completionHeadline, FORM_LIMITS.completionHeadline);
  }
  if (body.completionBody !== undefined) {
    u.completion_body = cleanBlock(body.completionBody, FORM_LIMITS.completionBody);
  }
  if (body.completionCta !== undefined) {
    u.completion_cta = cleanLine(body.completionCta, FORM_LIMITS.completionCta);
  }
  if (body.completionUrl !== undefined) u.completion_url = cleanUrl(body.completionUrl);
  if (body.completionPhone !== undefined) {
    u.completion_phone = cleanLine(body.completionPhone, FORM_LIMITS.completionPhone);
  }

  if (body.locale !== undefined) u.locale = cleanLine(body.locale, FORM_LIMITS.locale);
  if (body.trackingParams !== undefined) {
    u.tracking_params = cleanTrackingParams(body.trackingParams);
  }

  return u;
}

// ---------------------------------------------------------------------------
// The paste-out. The only thing this table produces, so it is part of the
// shared module and tested, not a detail of a component.
//
// Plain text, in Meta's own top-to-bottom order, so building the real form is a
// walk down the page. Blocks that were never written are skipped rather than
// printed empty: a paste full of "(none)" is a paste nobody reads.
//
// A follow-up is printed INDENTED under the answer that reveals it, which is
// how Meta's own builder shows it, rather than as a flat row with a rule
// dangling off the end.

// The field-name column has to line up or it is noise. Padded to the longest
// question line in the form, capped so one very long question does not push
// every key off the right edge.
const FIELD_COLUMN_MAX = 52;

export function formToText(form: LeadForm): string {
  const out: string[] = [];

  out.push(`FORM: ${form.name.trim() || "Untitled form"}`);
  out.push(`Type: ${INTENT_LABEL[form.intent]}   (${INTENT_NOTE[form.intent]})`);
  if (form.locale.trim()) out.push(`Language: ${form.locale.trim()}`);
  if (form.sharing === "open") out.push("Sharing: Open");

  if (form.introHeadline.trim() || form.introDescription.trim() || form.introImageUrl.trim()) {
    out.push("", "INTRO");
    if (form.introImageUrl.trim()) out.push(`Background image: ${form.introImageUrl.trim()}`);
    if (form.introHeadline.trim()) out.push(`Headline: ${form.introHeadline.trim()}`);
    if (form.introDescription.trim()) {
      out.push(`Layout: ${form.introLayout === "list" ? "list" : "paragraph"}`);
      const body = form.introDescription.trim();
      // A list is written one item per line, so it prints as one bullet per
      // line: the point of recording the layout is that the paste shows it.
      if (form.introLayout === "list") {
        for (const line of body.split("\n")) {
          if (line.trim()) out.push(`  - ${line.trim()}`);
        }
      } else out.push(body);
    }
  }

  out.push("", "QUESTIONS");
  if (form.questions.length === 0) {
    out.push("(none yet)");
  } else {
    out.push(...questionLines(form.questions));
  }

  if (
    form.privacyUrl.trim() ||
    form.privacyDisclaimer.trim() ||
    form.disclaimerTitle.trim() ||
    form.consents.length > 0
  ) {
    out.push("", "PRIVACY");
    if (form.privacyUrl.trim()) {
      const text = form.privacyLinkText.trim();
      out.push(`Policy URL: ${form.privacyUrl.trim()}${text ? `   shown as "${text}"` : ""}`);
    }
    if (form.disclaimerTitle.trim()) out.push(`Disclaimer title: ${form.disclaimerTitle.trim()}`);
    if (form.privacyDisclaimer.trim()) out.push(form.privacyDisclaimer.trim());
    for (const consent of form.consents) {
      out.push(`  [ ] ${consent.text}   (${consent.optional ? "optional" : "required"})`);
    }
  }

  const hasCompletion =
    form.completionHeadline.trim() ||
    form.completionBody.trim() ||
    form.completionCta.trim() ||
    form.completionUrl.trim() ||
    form.completionPhone.trim();

  if (hasCompletion) {
    out.push("", "COMPLETION");
    if (form.completionHeadline.trim()) out.push(`Headline: ${form.completionHeadline.trim()}`);
    if (form.completionBody.trim()) out.push(form.completionBody.trim());

    const label = COMPLETION_CTA_LABELS[form.completionCtaType];
    const text = form.completionCta.trim();
    out.push(`Button: ${label}${text && text !== label ? `, reading "${text}"` : ""}`);

    const needs = ctaNeeds(form.completionCtaType);
    if (needs === "url" && form.completionUrl.trim()) out.push(`URL: ${form.completionUrl.trim()}`);
    if (needs === "phone" && form.completionPhone.trim()) {
      out.push(`Phone: ${form.completionPhone.trim()}`);
    }
  }

  if (form.trackingParams.length > 0) {
    out.push("", "TRACKING PARAMETERS");
    for (const p of form.trackingParams) out.push(`${p.key} = ${p.value}`);
  }

  return out.join("\n");
}

// The question block, follow-ups nested under the answer that reveals them.
function questionLines(questions: LeadQuestion[]): string[] {
  const out: string[] = [];
  const byId = new Map(questions.map((q) => [q.id, q]));

  // A question is a follow-up if its rule names a question in this list AND an
  // answer that question actually offers. Anything else is printed at the top
  // level, so a question can never vanish from the paste because its rule was
  // odd: it would be nested under an answer that never prints.
  const isFollowUp = (q: LeadQuestion) => {
    if (!q.showIf) return false;
    const parent = byId.get(q.showIf.questionId);
    return !!parent && parent.options.some((o) => o.label === q.showIf!.optionLabel);
  };

  // The width the field-name column sits at, measured over the top-level rows
  // only: an indented follow-up is already narrower.
  const top = questions.filter((q) => !isFollowUp(q));
  const width = Math.min(
    FIELD_COLUMN_MAX,
    top.reduce((w, q, i) => Math.max(w, headline(q, i + 1).length), 0),
  );

  let n = 0;
  for (const q of questions) {
    if (isFollowUp(q)) continue;
    n += 1;
    out.push(...one(q, headline(q, n), width, ""));
  }
  return out;

  function headline(q: LeadQuestion, n: number): string {
    const kind = KIND_LABEL[q.kind];
    const opener =
      q.kind === "prefill"
        ? `[Prefill: ${q.prefill || "field not set"}]`
        : q.kind === "choice" && q.multiSelect
          ? "[Multiple choice, multi-select]"
          : `[${kind}]`;
    return `${n}. ${opener} ${q.label}`.trimEnd();
  }

  function one(q: LeadQuestion, head: string, pad: number, indent: string): string[] {
    const lines: string[] = [];
    const key = q.fieldName || defaultFieldName(q);
    const flags: string[] = [];
    if (q.optional) flags.push("optional");
    if (q.minLength) flags.push(`min ${q.minLength}`);
    if (q.maxLength) flags.push(`max ${q.maxLength}`);

    // The key is padded onto the same line so a whole form's field names read
    // as a column, which is how a mapping gets checked.
    lines.push(
      `${indent}${head.padEnd(indent ? 0 : pad)}  field: ${key}${
        flags.length ? `   (${flags.join(", ")})` : ""
      }`,
    );
    if (q.inlineContext) lines.push(`${indent}     ${q.inlineContext}`);

    for (const o of q.options) {
      lines.push(`${indent}     - ${o.label}${o.disqualify ? "   << DISQUALIFY" : ""}`);
      // Every question this answer reveals, printed under it. This is Meta's
      // conditional question, drawn the way Meta draws it.
      const children = questions.filter(
        (c) => c.showIf && c.showIf.questionId === q.id && c.showIf.optionLabel === o.label,
      );
      children.forEach((child, i) => {
        lines.push(
          `${indent}         ↳ ONLY IF "${o.label}"`,
        );
        lines.push(...one(child, headline(child, i + 1), 0, `${indent}         `));
      });
    }

    return lines;
  }
}
