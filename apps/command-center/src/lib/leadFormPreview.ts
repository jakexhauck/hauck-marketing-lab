// What the lead would actually see, worked out from a draft (0099).
//
// The lead form editor's right-hand pane is a form you can FILL IN, not a
// picture of one. That is the whole point of it: a branch that never fires and
// a question that hides itself are invisible in an editor and obvious the
// moment somebody taps through. So the rules live here, pure and tested, and
// the component only draws what these functions decide.
//
// Browser-only, like conversionAssetPreview.ts. The server never runs this: it
// stores a draft, it does not simulate one.

import {
  ctaNeeds,
  type LeadForm,
  type LeadQuestion,
} from "../../functions/lib/adLeadForms";
// One index, built one way. leadFormTree owns the shape of the list; this
// module only asks it questions.
import { indexById } from "./leadFormTree";

// What has been tapped so far, per question id. An array because a multi-select
// choice holds more than one, and one shape for every kind beats two.
export type Answers = Record<string, string[]>;

// The screens Meta walks a lead through, in order. Intro only exists when
// something was written on it, and the review step is what Higher intent buys.
export type ScreenId = "intro" | "questions" | "review" | "completion";

export function screensFor(form: LeadForm): ScreenId[] {
  const screens: ScreenId[] = [];
  if (form.introHeadline.trim() || form.introDescription.trim() || form.introImageUrl.trim()) {
    screens.push("intro");
  }
  screens.push("questions");
  if (form.intent === "higher_intent") screens.push("review");
  screens.push("completion");
  return screens;
}

export const SCREEN_LABEL: Record<ScreenId, string> = {
  intro: "Intro",
  questions: "Questions",
  review: "Review",
  completion: "Completion",
};

// Whether a question is asked, given what has been answered so far.
//
// Walks the chain UP, not down: a follow-up of a follow-up is only asked when
// every answer above it was given. Guarded against a rule that loops back on
// itself, which the cleaner forbids but a hand-edited row could still hold.
export function isVisible(
  question: LeadQuestion,
  byId: Map<string, LeadQuestion>,
  answers: Answers,
): boolean {
  const seen = new Set<string>();
  let current: LeadQuestion | undefined = question;

  while (current?.showIf) {
    if (seen.has(current.id)) return false;
    seen.add(current.id);

    const { questionId, optionLabel } = current.showIf;
    const given = answers[questionId] ?? [];
    if (!given.includes(optionLabel)) return false;

    current = byId.get(questionId);
    // A rule naming a question that is not in the list can never be satisfied.
    if (!current) return false;
  }

  return true;
}

export function visibleQuestions(questions: LeadQuestion[], answers: Answers): LeadQuestion[] {
  const byId = indexById(questions);
  return questions.filter((q) => isVisible(q, byId, answers));
}

// Answers to questions that are no longer asked, dropped.
//
// Without this, changing a parent answer leaves the follow-up's answer sitting
// in the map: pick Windows, answer the window question, switch to Siding, and
// the window answer is still there waiting to reappear the moment you switch
// back. It reads as a ghost and it makes the review screen lie.
export function pruneAnswers(questions: LeadQuestion[], answers: Answers): Answers {
  const byId = indexById(questions);
  const kept: Answers = {};
  for (const q of questions) {
    const given = answers[q.id];
    if (given && given.length && isVisible(q, byId, answers)) kept[q.id] = given;
  }
  return kept;
}

// Tapping an answer on a choice. Multi-select toggles, single-select replaces,
// and tapping the answer you are already on clears it, so a branch can be
// backed out of without reloading the preview.
export function toggleAnswer(
  question: LeadQuestion,
  answers: Answers,
  label: string,
): Answers {
  const given = answers[question.id] ?? [];
  const next = question.multiSelect
    ? given.includes(label)
      ? given.filter((l) => l !== label)
      : [...given, label]
    : given.includes(label)
      ? []
      : [label];
  return { ...answers, [question.id]: next };
}

// Whether what has been picked so far would end the form as a bad fit. Our own
// flag, not Meta's, so this is a drafting signal: it says the branch you are
// looking at is the one that throws the lead away.
export function disqualifiedBy(questions: LeadQuestion[], answers: Answers): string[] {
  const hit: string[] = [];
  for (const q of visibleQuestions(questions, answers)) {
    const given = answers[q.id] ?? [];
    for (const o of q.options) {
      if (o.disqualify && given.includes(o.label)) hit.push(o.label);
    }
  }
  return hit;
}

// The completion button's target, as one line, or empty when the button needs
// nothing beside it.
export function ctaTarget(form: LeadForm): string {
  const needs = ctaNeeds(form.completionCtaType);
  if (needs === "url") return form.completionUrl;
  if (needs === "phone") return form.completionPhone;
  return "";
}

// What a prefill question shows in the box. Meta arrives with the profile's
// value already in it, so an empty box would be the one thing the real form
// never looks like.
const SAMPLE: Record<string, string> = {
  email: "dave@example.com",
  work_email: "dave@willis.co",
  phone_number: "(609) 555 0142",
  work_phone_number: "(609) 555 0142",
  full_name: "Dave Willis",
  first_name: "Dave",
  last_name: "Willis",
  street_address: "14 Ocean Drive",
  city: "Cape May Court House",
  state: "NJ",
  province: "NJ",
  zip_code: "08210",
  post_code: "08210",
  country: "United States",
  job_title: "Owner",
  company_name: "Willis Windows",
  company_size: "1 to 10",
  date_of_birth: "12 May 1981",
  gender: "Male",
  marital_status: "Married",
  relationship_status: "Married",
  military_status: "Veteran",
};

export function prefillSample(field: string): string {
  const key = field
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return SAMPLE[key] ?? "";
}
