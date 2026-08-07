import { describe, expect, it } from "vitest";
import {
  cleanOptions,
  cleanQuestions,
  FORM_LIMITS,
  formPatchColumns,
  formToText,
  isLeadFormIntent,
  isLeadQuestionKind,
  toLeadForm,
  type LeadForm,
  type LeadFormRow,
} from "./adLeadForms";

describe("cleanOptions", () => {
  it("keeps a label and its disqualify flag", () => {
    expect(cleanOptions([{ label: "Just looking", disqualify: true }])).toEqual([
      { label: "Just looking", disqualify: true },
    ]);
  });

  it("defaults disqualify to false for anything that is not exactly true", () => {
    expect(cleanOptions([{ label: "Storm", disqualify: "yes" }])[0].disqualify).toBe(false);
    expect(cleanOptions([{ label: "Storm" }])[0].disqualify).toBe(false);
  });

  it("drops an option with no label", () => {
    expect(cleanOptions([{ label: "  " }, { label: "Real" }])).toHaveLength(1);
  });

  it("caps the list and each label", () => {
    const many = Array.from({ length: FORM_LIMITS.options + 5 }, (_, i) => ({ label: `o${i}` }));
    expect(cleanOptions(many)).toHaveLength(FORM_LIMITS.options);
    expect(cleanOptions([{ label: "x".repeat(400) }])[0].label).toHaveLength(
      FORM_LIMITS.optionLabel,
    );
  });

  it("survives junk", () => {
    expect(cleanOptions(null)).toEqual([]);
    expect(cleanOptions([null, 3])).toEqual([]);
  });
});

describe("cleanQuestions", () => {
  it("keeps a choice question with its options", () => {
    const qs = cleanQuestions([
      { id: "q1", kind: "choice", label: "What damage?", options: [{ label: "Storm" }] },
    ]);
    expect(qs).toHaveLength(1);
    expect(qs[0].kind).toBe("choice");
    expect(qs[0].options).toEqual([{ label: "Storm", disqualify: false }]);
  });

  it("stamps an id when one is missing, so a rule can name the question", () => {
    expect(cleanQuestions([{ label: "First" }, { label: "Second" }]).map((q) => q.id)).toEqual([
      "q1",
      "q2",
    ]);
  });

  it("re-stamps a duplicate id rather than leaving showIf ambiguous", () => {
    const qs = cleanQuestions([
      { id: "q1", label: "One" },
      { id: "q1", label: "Two" },
    ]);
    expect(qs[0].id).toBe("q1");
    expect(qs[1].id).toBe("q1_1");
  });

  it("rejects an id that is not safe to print", () => {
    expect(cleanQuestions([{ id: "a b/c", label: "One" }])[0].id).toBe("q1");
  });

  it("defaults an unknown kind to short answer", () => {
    expect(cleanQuestions([{ kind: "carousel", label: "Q" }])[0].kind).toBe("short");
  });

  it("strips options off a question that is not a choice", () => {
    const qs = cleanQuestions([{ kind: "short", label: "Q", options: [{ label: "x" }] }]);
    expect(qs[0].options).toEqual([]);
  });

  it("strips prefill off a question that is not a prefill", () => {
    expect(cleanQuestions([{ kind: "short", label: "Q", prefill: "Email" }])[0].prefill).toBe("");
  });

  it("keeps a prefill question that has no label of its own", () => {
    const qs = cleanQuestions([{ kind: "prefill", prefill: "Email", label: "" }]);
    expect(qs).toHaveLength(1);
    expect(qs[0].prefill).toBe("Email");
  });

  it("keeps a rule that points back at a real choice and a real option", () => {
    const qs = cleanQuestions([
      { id: "q1", kind: "choice", label: "Damage?", options: [{ label: "Storm" }] },
      { id: "q2", kind: "short", label: "When?", showIf: { questionId: "q1", optionLabel: "Storm" } },
    ]);
    expect(qs[1].showIf).toEqual({ questionId: "q1", optionLabel: "Storm" });
  });

  it("drops a rule naming an option that does not exist", () => {
    const qs = cleanQuestions([
      { id: "q1", kind: "choice", label: "Damage?", options: [{ label: "Storm" }] },
      { id: "q2", label: "When?", showIf: { questionId: "q1", optionLabel: "Hail" } },
    ]);
    expect(qs[1].showIf).toBeNull();
  });

  it("drops a rule naming a question that does not exist", () => {
    const qs = cleanQuestions([
      { id: "q1", label: "When?", showIf: { questionId: "q9", optionLabel: "Storm" } },
    ]);
    expect(qs[0].showIf).toBeNull();
  });

  it("drops a rule pointing FORWARD, which Meta cannot ask", () => {
    const qs = cleanQuestions([
      { id: "q1", label: "When?", showIf: { questionId: "q2", optionLabel: "Storm" } },
      { id: "q2", kind: "choice", label: "Damage?", options: [{ label: "Storm" }] },
    ]);
    expect(qs[0].showIf).toBeNull();
  });

  it("drops a rule pointing at a short answer, which has no options to match", () => {
    const qs = cleanQuestions([
      { id: "q1", kind: "short", label: "Age?" },
      { id: "q2", label: "When?", showIf: { questionId: "q1", optionLabel: "Storm" } },
    ]);
    expect(qs[1].showIf).toBeNull();
  });

  it("drops a question nobody filled in", () => {
    expect(cleanQuestions([{ label: "  ", prefill: "", options: [] }])).toEqual([]);
  });

  it("caps the number of questions", () => {
    const many = Array.from({ length: FORM_LIMITS.questions + 10 }, (_, i) => ({ label: `q${i}` }));
    expect(cleanQuestions(many)).toHaveLength(FORM_LIMITS.questions);
  });

  it("survives junk", () => {
    expect(cleanQuestions(null)).toEqual([]);
    expect(cleanQuestions("nope")).toEqual([]);
  });
});

describe("formPatchColumns", () => {
  it("writes only the keys the body names", () => {
    const u = formPatchColumns({ name: "Storm form" });
    expect(u).toEqual({ name: "Storm form" });
  });

  it("ignores an intent it does not recognise rather than defaulting it", () => {
    expect(formPatchColumns({ intent: "nonsense" })).not.toHaveProperty("intent");
    expect(formPatchColumns({ intent: "higher_intent" })).toHaveProperty(
      "intent",
      "higher_intent",
    );
  });

  it("repairs a bare privacy URL and drops one that is not a link", () => {
    expect(formPatchColumns({ privacyUrl: "willis.com/privacy" }).privacy_url).toBe(
      "https://willis.com/privacy",
    );
    expect(formPatchColumns({ privacyUrl: "not a url" }).privacy_url).toBe("");
  });

  it("keeps the line breaks in a disclaimer but flattens a headline", () => {
    expect(formPatchColumns({ privacyDisclaimer: "a\n\nb" }).privacy_disclaimer).toBe("a\n\nb");
    expect(formPatchColumns({ completionHeadline: "a\nb" }).completion_headline).toBe("a b");
  });

  it("accepts an empty question list, so the last question can be removed", () => {
    expect(formPatchColumns({ questions: [] })).toHaveProperty("questions", []);
  });
});

describe("toLeadForm", () => {
  const row: LeadFormRow = {
    id: "f1",
    tenant_id: "t1",
    name: "Storm damage",
    intent: "higher_intent",
    intro_headline: "Get a quote",
    intro_description: "Two minutes.",
    questions: [{ id: "q1", kind: "choice", label: "Damage?", options: [{ label: "Storm" }] }],
    privacy_url: "https://willis.com/privacy",
    privacy_disclaimer: "",
    completion_headline: "Thanks",
    completion_body: "",
    completion_cta: "View website",
    completion_url: "https://willis.com",
    created_at: "2026-08-07T00:00:00Z",
    updated_at: "2026-08-07T00:00:00Z",
  };

  it("maps a row to the shape the browser reads", () => {
    const form = toLeadForm(row);
    expect(form.intent).toBe("higher_intent");
    expect(form.questions[0].options[0].label).toBe("Storm");
    expect(form.completionCta).toBe("View website");
  });

  it("renders rather than throws when the stored intent is nonsense", () => {
    expect(toLeadForm({ ...row, intent: "whatever" }).intent).toBe("more_volume");
  });

  it("survives questions jsonb that is not the shape it should be", () => {
    expect(toLeadForm({ ...row, questions: "nope" }).questions).toEqual([]);
  });
});

describe("formToText", () => {
  const base: LeadForm = {
    id: "f1",
    tenantId: "t1",
    name: "Storm damage",
    intent: "higher_intent",
    introHeadline: "",
    introDescription: "",
    questions: [],
    privacyUrl: "",
    privacyDisclaimer: "",
    completionHeadline: "",
    completionBody: "",
    completionCta: "",
    completionUrl: "",
    createdAt: "",
    updatedAt: "",
  };

  it("leads with the name and Meta's form type", () => {
    const text = formToText(base);
    expect(text).toContain("FORM: Storm damage");
    expect(text).toContain("Type: Higher intent");
  });

  it("names an untitled form rather than printing a blank", () => {
    expect(formToText({ ...base, name: "  " })).toContain("FORM: Untitled form");
  });

  it("skips blocks that were never written", () => {
    const text = formToText(base);
    expect(text).not.toContain("INTRO");
    expect(text).not.toContain("PRIVACY");
    expect(text).not.toContain("COMPLETION");
  });

  it("numbers the questions and marks each kind", () => {
    const text = formToText({
      ...base,
      questions: cleanQuestions([
        { id: "q1", kind: "choice", label: "Damage?", options: [{ label: "Storm" }] },
        { id: "q2", kind: "short", label: "How old?" },
        { id: "q3", kind: "prefill", prefill: "Email", label: "Email" },
      ]),
    });
    expect(text).toContain("1. [Multiple choice] Damage?");
    expect(text).toContain("     - Storm");
    expect(text).toContain("2. [Short answer] How old?");
    expect(text).toContain("3. [Prefill: Email] Email");
  });

  it("flags a disqualifying answer", () => {
    const text = formToText({
      ...base,
      questions: cleanQuestions([
        {
          id: "q1",
          kind: "choice",
          label: "Damage?",
          options: [{ label: "Just looking", disqualify: true }],
        },
      ]),
    });
    expect(text).toContain("Just looking   << DISQUALIFY");
  });

  it("spells a rule out using the question's words, not its id", () => {
    const text = formToText({
      ...base,
      questions: cleanQuestions([
        { id: "q1", kind: "choice", label: "What damage?", options: [{ label: "Storm" }] },
        {
          id: "q2",
          kind: "short",
          label: "When?",
          showIf: { questionId: "q1", optionLabel: "Storm" },
        },
      ]),
    });
    expect(text).toContain('ONLY IF "What damage?" = "Storm"');
  });

  it("says so when there are no questions yet", () => {
    expect(formToText(base)).toContain("(none yet)");
  });

  it("prints the completion block when any part of it is written", () => {
    const text = formToText({ ...base, completionCta: "View website" });
    expect(text).toContain("COMPLETION");
    expect(text).toContain("Button: View website");
  });
});

describe("guards", () => {
  it("accepts the two intents and nothing else", () => {
    expect(isLeadFormIntent("more_volume")).toBe(true);
    expect(isLeadFormIntent("higher_intent")).toBe(true);
    expect(isLeadFormIntent("volume")).toBe(false);
  });

  it("accepts the three question kinds and nothing else", () => {
    expect(isLeadQuestionKind("prefill")).toBe(true);
    expect(isLeadQuestionKind("short")).toBe(true);
    expect(isLeadQuestionKind("choice")).toBe(true);
    expect(isLeadQuestionKind("dropdown")).toBe(false);
  });
});
