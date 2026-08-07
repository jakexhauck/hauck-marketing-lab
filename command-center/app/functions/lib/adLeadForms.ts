// Lead forms: the shape, the cleaning, and the text that gets pasted (0090).
//
// A draft of a Meta Instant Form. Nothing here talks to Meta; the output is
// text on a clipboard. Shared by the two endpoints that write ad_lead_forms and
// imported for its types by the browser, so the editor and the server cannot
// disagree about what a form is.
//
// Every field is plain text and is rendered as text. The cleaners are the whole
// trust boundary: they cap length and flatten control characters, exactly as
// adWorkspace.ts does. No HTML, no markdown, no sanitizer.

import { cleanBlock, cleanLine, cleanUrl } from "./adWorkspace";

// Meta's two form types. Recorded rather than acted on: it changes nothing here
// and exists so the paste is a complete instruction.
export type LeadFormIntent = "more_volume" | "higher_intent";

export const LEAD_FORM_INTENTS: LeadFormIntent[] = ["more_volume", "higher_intent"];

export function isLeadFormIntent(value: unknown): value is LeadFormIntent {
  return value === "more_volume" || value === "higher_intent";
}

export const INTENT_LABEL: Record<LeadFormIntent, string> = {
  more_volume: "More volume",
  higher_intent: "Higher intent",
};

// prefill = Meta fills it from the profile. short = a typed answer.
// choice = multiple choice, and the only kind another question can branch on.
export type LeadQuestionKind = "prefill" | "short" | "choice";

export const LEAD_QUESTION_KINDS: LeadQuestionKind[] = ["prefill", "short", "choice"];

export function isLeadQuestionKind(value: unknown): value is LeadQuestionKind {
  return value === "prefill" || value === "short" || value === "choice";
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
  // Which profile field, when kind is prefill. Free text; the UI suggests
  // Meta's list but Meta keeps adding to it.
  prefill: string;
  // choice only.
  options: LeadQuestionOption[];
  // Meta's conditional question: asked only when an earlier choice was given.
  // One antecedent, one value, because that is all Meta can express.
  showIf: { questionId: string; optionLabel: string } | null;
}

export interface LeadForm {
  id: string;
  tenantId: string;
  name: string;
  intent: LeadFormIntent;
  introHeadline: string;
  introDescription: string;
  questions: LeadQuestion[];
  privacyUrl: string;
  privacyDisclaimer: string;
  completionHeadline: string;
  completionBody: string;
  completionCta: string;
  completionUrl: string;
  createdAt: string;
  updatedAt: string;
}

export const FORM_LIMITS = {
  name: 120,
  introHeadline: 200,
  introDescription: 2000,
  questionLabel: 300,
  prefill: 60,
  optionLabel: 200,
  options: 20,
  questions: 40,
  disclaimer: 2000,
  completionHeadline: 200,
  completionBody: 2000,
  completionCta: 60,
  questionId: 20,
} as const;

// Meta's prefill fields, offered as suggestions in the editor. Not enforced:
// the box takes any text, because this list is Meta's and it grows.
export const PREFILL_SUGGESTIONS = [
  "Email",
  "Phone number",
  "Full name",
  "First name",
  "Last name",
  "Street address",
  "City",
  "State",
  "Zip code",
  "Country",
  "Company name",
  "Job title",
  "Work email",
  "Work phone number",
  "Date of birth",
  "Gender",
];

// A question id: short, and safe to print inside the paste-out. Anything else
// is dropped and the question is re-stamped by the caller.
function cleanQuestionId(value: unknown): string {
  if (typeof value !== "string") return "";
  const id = value.trim().slice(0, FORM_LIMITS.questionId);
  return /^[A-Za-z0-9_-]+$/.test(id) ? id : "";
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
      prefill: kind === "prefill" ? cleanLine(row.prefill, FORM_LIMITS.prefill) : "",
      // Options only mean anything on a choice. Kept off the other kinds so a
      // question switched from choice to short does not carry a hidden list.
      options: kind === "choice" ? cleanOptions(row.options) : [],
      showIf: readShowIf(row.showIf),
    };
  });

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

  // A question with no text and nothing chosen is an Add nobody filled in.
  return questions.filter((q) => q.label || q.prefill || q.options.length);
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
  intro_headline: string;
  intro_description: string;
  questions: unknown;
  privacy_url: string;
  privacy_disclaimer: string;
  completion_headline: string;
  completion_body: string;
  completion_cta: string;
  completion_url: string;
  created_at: string;
  updated_at: string;
}

export const LEAD_FORM_SELECT =
  "id, tenant_id, name, intent, intro_headline, intro_description, questions, " +
  "privacy_url, privacy_disclaimer, completion_headline, completion_body, " +
  "completion_cta, completion_url, created_at, updated_at";

export function toLeadForm(row: LeadFormRow): LeadForm {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    intent: isLeadFormIntent(row.intent) ? row.intent : "more_volume",
    introHeadline: row.intro_headline,
    introDescription: row.intro_description,
    questions: cleanQuestions(row.questions),
    privacyUrl: row.privacy_url,
    privacyDisclaimer: row.privacy_disclaimer,
    completionHeadline: row.completion_headline,
    completionBody: row.completion_body,
    completionCta: row.completion_cta,
    completionUrl: row.completion_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface LeadFormPatch {
  name?: string;
  intent?: string;
  introHeadline?: string;
  introDescription?: string;
  questions?: LeadQuestion[];
  privacyUrl?: string;
  privacyDisclaimer?: string;
  completionHeadline?: string;
  completionBody?: string;
  completionCta?: string;
  completionUrl?: string;
}

// Only the keys the body actually named, so an absent key is left alone. Same
// contract as patchColumns in adWorkspace.ts: the editor saves one block at a
// time as it is left.
export function formPatchColumns(body: LeadFormPatch): Record<string, unknown> {
  const u: Record<string, unknown> = {};

  if (body.name !== undefined) u.name = cleanLine(body.name, FORM_LIMITS.name);
  // An unrecognised intent is ignored rather than defaulted, or a typo in a
  // hand-made request would quietly flip a form back to More volume.
  if (body.intent !== undefined && isLeadFormIntent(body.intent)) u.intent = body.intent;

  if (body.introHeadline !== undefined) {
    u.intro_headline = cleanLine(body.introHeadline, FORM_LIMITS.introHeadline);
  }
  if (body.introDescription !== undefined) {
    u.intro_description = cleanBlock(body.introDescription, FORM_LIMITS.introDescription);
  }

  if (body.questions !== undefined) u.questions = cleanQuestions(body.questions);

  if (body.privacyUrl !== undefined) u.privacy_url = cleanUrl(body.privacyUrl);
  if (body.privacyDisclaimer !== undefined) {
    u.privacy_disclaimer = cleanBlock(body.privacyDisclaimer, FORM_LIMITS.disclaimer);
  }

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

  return u;
}

// ---------------------------------------------------------------------------
// The paste-out. The only thing this table produces, so it is part of the
// shared module and tested, not a detail of a component.
//
// Plain text, in Meta's own top-to-bottom order, so building the real form is a
// walk down the page. Blocks that were never written are skipped rather than
// printed empty: a paste full of "(none)" is a paste nobody reads.

export function formToText(form: LeadForm): string {
  const out: string[] = [];

  out.push(`FORM: ${form.name.trim() || "Untitled form"}`);
  out.push(`Type: ${INTENT_LABEL[form.intent]}`);

  if (form.introHeadline.trim() || form.introDescription.trim()) {
    out.push("", "INTRO");
    if (form.introHeadline.trim()) out.push(`Headline: ${form.introHeadline.trim()}`);
    if (form.introDescription.trim()) out.push(form.introDescription.trim());
  }

  out.push("", "QUESTIONS");
  if (form.questions.length === 0) {
    out.push("(none yet)");
  } else {
    const labelById = new Map(form.questions.map((q) => [q.id, q.label || q.prefill || q.id]));
    form.questions.forEach((q, i) => {
      const n = i + 1;
      if (q.kind === "prefill") {
        out.push(`${n}. [Prefill: ${q.prefill || "field not set"}] ${q.label}`.trimEnd());
      } else if (q.kind === "short") {
        out.push(`${n}. [Short answer] ${q.label}`.trimEnd());
      } else {
        out.push(`${n}. [Multiple choice] ${q.label}`.trimEnd());
        for (const o of q.options) {
          out.push(`     - ${o.label}${o.disqualify ? "   << DISQUALIFY" : ""}`);
        }
      }
      if (q.showIf) {
        const asked = labelById.get(q.showIf.questionId) ?? q.showIf.questionId;
        out.push(`     ONLY IF "${asked}" = "${q.showIf.optionLabel}"`);
      }
    });
  }

  if (form.privacyUrl.trim() || form.privacyDisclaimer.trim()) {
    out.push("", "PRIVACY");
    if (form.privacyUrl.trim()) out.push(`Policy URL: ${form.privacyUrl.trim()}`);
    if (form.privacyDisclaimer.trim()) out.push(form.privacyDisclaimer.trim());
  }

  const hasCompletion =
    form.completionHeadline.trim() ||
    form.completionBody.trim() ||
    form.completionCta.trim() ||
    form.completionUrl.trim();

  if (hasCompletion) {
    out.push("", "COMPLETION");
    if (form.completionHeadline.trim()) out.push(`Headline: ${form.completionHeadline.trim()}`);
    if (form.completionBody.trim()) out.push(form.completionBody.trim());
    if (form.completionCta.trim()) out.push(`Button: ${form.completionCta.trim()}`);
    if (form.completionUrl.trim()) out.push(`URL: ${form.completionUrl.trim()}`);
  }

  return out.join("\n");
}
