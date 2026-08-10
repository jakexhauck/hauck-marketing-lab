import { describe, expect, it } from "vitest";
import type { LeadForm, LeadQuestion } from "../../functions/lib/adLeadForms";
import {
  ctaTarget,
  disqualifiedBy,
  isVisible,
  prefillSample,
  pruneAnswers,
  screensFor,
  toggleAnswer,
  visibleQuestions,
} from "./leadFormPreview";
import { indexById } from "./leadFormTree";

function q(id: string, fields: Partial<LeadQuestion> = {}): LeadQuestion {
  return {
    id,
    kind: "short",
    label: id,
    fieldName: "",
    prefill: "",
    optional: false,
    multiSelect: false,
    minLength: 0,
    maxLength: 0,
    inlineContext: "",
    options: [],
    showIf: null,
    ...fields,
  };
}

const choice = (id: string, labels: string[], multiSelect = false) =>
  q(id, {
    kind: "choice",
    multiSelect,
    options: labels.map((label) => ({ label, disqualify: false })),
  });

const under = (id: string, parent: string, option: string) =>
  q(id, { showIf: { questionId: parent, optionLabel: option } });

const form = (fields: Partial<LeadForm> = {}): LeadForm => ({
  id: "f1",
  tenantId: "t1",
  name: "",
  intent: "more_volume",
  introImageUrl: "",
  introHeadline: "",
  introDescription: "",
  introLayout: "paragraph",
  questions: [],
  privacyUrl: "",
  privacyLinkText: "",
  disclaimerTitle: "",
  privacyDisclaimer: "",
  consents: [],
  completionHeadline: "",
  completionBody: "",
  completionCtaType: "view_website",
  completionCta: "",
  completionUrl: "",
  completionPhone: "",
  locale: "",
  sharing: "restricted",
  trackingParams: [],
  createdAt: "",
  updatedAt: "",
  ...fields,
});

describe("screensFor", () => {
  it("skips the intro when nothing was written on it", () => {
    expect(screensFor(form())).toEqual(["questions", "completion"]);
  });

  it("shows the intro when any part of it is written", () => {
    expect(screensFor(form({ introHeadline: "Hi" }))).toContain("intro");
    expect(screensFor(form({ introImageUrl: "https://x/y.jpg" }))).toContain("intro");
  });

  it("adds the review step Higher intent buys, and only for it", () => {
    expect(screensFor(form({ intent: "higher_intent" }))).toContain("review");
    expect(screensFor(form({ intent: "rich_creative" }))).not.toContain("review");
  });
});

describe("visibility", () => {
  const questions = [choice("q1", ["Windows", "Siding"]), under("q2", "q1", "Windows")];

  it("hides a follow-up until its answer is given", () => {
    expect(visibleQuestions(questions, {}).map((x) => x.id)).toEqual(["q1"]);
    expect(visibleQuestions(questions, { q1: ["Windows"] }).map((x) => x.id)).toEqual(["q1", "q2"]);
  });

  it("hides it again for the other answer", () => {
    expect(visibleQuestions(questions, { q1: ["Siding"] }).map((x) => x.id)).toEqual(["q1"]);
  });

  it("asks a follow-up of a follow-up only when every answer above it was given", () => {
    const deep = [
      choice("q1", ["Windows"]),
      choice("q2", ["Wood"]),
      under("q3", "q2", "Wood"),
    ];
    deep[1].showIf = { questionId: "q1", optionLabel: "Windows" };

    expect(visibleQuestions(deep, { q2: ["Wood"] }).map((x) => x.id)).toEqual(["q1"]);
    expect(visibleQuestions(deep, { q1: ["Windows"], q2: ["Wood"] }).map((x) => x.id)).toEqual([
      "q1",
      "q2",
      "q3",
    ]);
  });

  it("never shows a question whose rule points in a circle", () => {
    const loop = [
      q("q1", { showIf: { questionId: "q2", optionLabel: "x" } }),
      q("q2", { showIf: { questionId: "q1", optionLabel: "x" } }),
    ];
    expect(visibleQuestions(loop, { q1: ["x"], q2: ["x"] })).toEqual([]);
  });

  it("never shows a question whose rule names nothing in the list", () => {
    const orphan = [under("q2", "gone", "Windows")];
    expect(visibleQuestions(orphan, { gone: ["Windows"] })).toEqual([]);
  });

  it("is the same answer for isVisible on its own", () => {
    expect(isVisible(questions[1], indexById(questions), { q1: ["Windows"] })).toBe(true);
    expect(isVisible(questions[1], indexById(questions), {})).toBe(false);
  });
});

describe("toggleAnswer", () => {
  it("replaces on a single-select and clears when the same answer is tapped again", () => {
    const single = choice("q1", ["Windows", "Siding"]);
    const picked = toggleAnswer(single, {}, "Windows");
    expect(picked.q1).toEqual(["Windows"]);
    expect(toggleAnswer(single, picked, "Siding").q1).toEqual(["Siding"]);
    expect(toggleAnswer(single, picked, "Windows").q1).toEqual([]);
  });

  it("accumulates on a multi-select", () => {
    const many = choice("q1", ["Windows", "Siding"], true);
    const one = toggleAnswer(many, {}, "Windows");
    expect(toggleAnswer(many, one, "Siding").q1).toEqual(["Windows", "Siding"]);
    expect(toggleAnswer(many, one, "Windows").q1).toEqual([]);
  });
});

describe("pruneAnswers", () => {
  it("drops the answer to a question that is no longer asked", () => {
    // Pick Windows, answer the window question, switch to Siding: the window
    // answer must not survive to reappear or to show up on the review screen.
    const questions = [choice("q1", ["Windows", "Siding"]), under("q2", "q1", "Windows")];
    const answered = { q1: ["Windows"], q2: ["Nine"] };
    expect(pruneAnswers(questions, answered)).toEqual(answered);

    const switched = { ...answered, q1: ["Siding"] };
    expect(pruneAnswers(questions, switched)).toEqual({ q1: ["Siding"] });
  });

  it("drops an answer to a question that was deleted outright", () => {
    expect(pruneAnswers([choice("q1", ["A"])], { q1: ["A"], gone: ["x"] })).toEqual({ q1: ["A"] });
  });
});

describe("disqualifiedBy", () => {
  it("names the answers picked that end the form as a bad fit", () => {
    const questions = [
      q("q1", {
        kind: "choice",
        options: [
          { label: "Ready now", disqualify: false },
          { label: "Just looking", disqualify: true },
        ],
      }),
    ];
    expect(disqualifiedBy(questions, { q1: ["Just looking"] })).toEqual(["Just looking"]);
    expect(disqualifiedBy(questions, { q1: ["Ready now"] })).toEqual([]);
  });

  it("ignores a disqualifying answer on a question that is not being asked", () => {
    const questions = [
      choice("q1", ["Windows", "Siding"]),
      q("q2", {
        kind: "choice",
        showIf: { questionId: "q1", optionLabel: "Windows" },
        options: [{ label: "Just looking", disqualify: true }],
      }),
    ];
    expect(disqualifiedBy(questions, { q1: ["Siding"], q2: ["Just looking"] })).toEqual([]);
  });
});

describe("ctaTarget", () => {
  it("returns the field the button kind actually uses", () => {
    const both = { completionUrl: "https://willis.com", completionPhone: "(609) 555 0142" };
    expect(ctaTarget(form({ ...both, completionCtaType: "view_website" }))).toBe(
      "https://willis.com",
    );
    expect(ctaTarget(form({ ...both, completionCtaType: "call_business" }))).toBe("(609) 555 0142");
    expect(ctaTarget(form({ ...both, completionCtaType: "message_business" }))).toBe("");
  });
});

describe("prefillSample", () => {
  it("shows what Facebook would have already filled in", () => {
    expect(prefillSample("Email")).toContain("@");
    expect(prefillSample("Phone number")).toBeTruthy();
  });

  it("says nothing for a field it has no sample for", () => {
    expect(prefillSample("Favourite window")).toBe("");
  });
});
