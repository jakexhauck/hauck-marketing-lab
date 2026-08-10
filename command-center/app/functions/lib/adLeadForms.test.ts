import { describe, expect, it } from "vitest";
import {
  cleanConsents,
  cleanFieldName,
  cleanOptions,
  cleanQuestions,
  cleanTrackingParams,
  defaultFieldName,
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
    intro_image_url: "https://cdn.example.com/hero.jpg",
    intro_headline: "Get a quote",
    intro_description: "Two minutes.",
    intro_layout: "list",
    questions: [{ id: "q1", kind: "choice", label: "Damage?", options: [{ label: "Storm" }] }],
    privacy_url: "https://willis.com/privacy",
    privacy_link_text: "Privacy policy",
    disclaimer_title: "Before you send",
    privacy_disclaimer: "",
    consents: [{ text: "Contact me", optional: true }],
    completion_headline: "Thanks",
    completion_body: "",
    completion_cta_type: "call_business",
    completion_cta: "Call us",
    completion_url: "https://willis.com",
    completion_phone: "(609) 555 0142",
    locale: "English (US)",
    sharing: "open",
    tracking_params: [{ key: "source", value: "storm_q3" }],
    created_at: "2026-08-07T00:00:00Z",
    updated_at: "2026-08-07T00:00:00Z",
  };

  it("maps a row to the shape the browser reads", () => {
    const form = toLeadForm(row);
    expect(form.intent).toBe("higher_intent");
    expect(form.questions[0].options[0].label).toBe("Storm");
    expect(form.completionCta).toBe("Call us");
    expect(form.completionCtaType).toBe("call_business");
    expect(form.introLayout).toBe("list");
    expect(form.sharing).toBe("open");
    expect(form.consents).toEqual([{ text: "Contact me", optional: true }]);
    expect(form.trackingParams).toEqual([{ key: "source", value: "storm_q3" }]);
  });

  it("reads Meta's third form type", () => {
    expect(toLeadForm({ ...row, intent: "rich_creative" }).intent).toBe("rich_creative");
  });

  it("renders rather than throws when a stored enum is nonsense", () => {
    const form = toLeadForm({
      ...row,
      intent: "whatever",
      intro_layout: "carousel",
      sharing: "public",
      completion_cta_type: "explode",
    });
    expect(form.intent).toBe("more_volume");
    expect(form.introLayout).toBe("paragraph");
    expect(form.sharing).toBe("restricted");
    expect(form.completionCtaType).toBe("view_website");
  });

  it("survives questions jsonb that is not the shape it should be", () => {
    expect(toLeadForm({ ...row, questions: "nope" }).questions).toEqual([]);
    expect(toLeadForm({ ...row, consents: 7 }).consents).toEqual([]);
    expect(toLeadForm({ ...row, tracking_params: null }).trackingParams).toEqual([]);
  });
});

describe("formToText", () => {
  const base: LeadForm = {
    id: "f1",
    tenantId: "t1",
    name: "Storm damage",
    intent: "higher_intent",
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

  it("nests a follow-up under the answer that reveals it, the way Meta draws it", () => {
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
    const lines = text.split("\n");
    const answer = lines.findIndex((l) => l.includes("- Storm"));
    expect(lines[answer + 1]).toContain('ONLY IF "Storm"');
    expect(lines[answer + 2]).toContain("[Short answer] When?");
    // Nested, not listed below the form as a rule dangling off the end.
    expect(lines[answer + 2].startsWith(" ")).toBe(true);
  });

  it("numbers only the top level, so a follow-up is not question 2", () => {
    const text = formToText({
      ...base,
      questions: cleanQuestions([
        { id: "q1", kind: "choice", label: "Damage?", options: [{ label: "Storm" }] },
        { id: "q2", label: "When?", showIf: { questionId: "q1", optionLabel: "Storm" } },
        { id: "q3", kind: "short", label: "Budget?" },
      ]),
    });
    expect(text).toContain("1. [Multiple choice] Damage?");
    expect(text).toContain("2. [Short answer] Budget?");
  });

  it("prints the field name every question will arrive under", () => {
    const text = formToText({
      ...base,
      questions: cleanQuestions([{ id: "q1", kind: "short", label: "How many windows?" }]),
    });
    expect(text).toContain("field: how_many_windows");
  });

  it("prefers the field name that was typed over the one derived", () => {
    const text = formToText({
      ...base,
      questions: cleanQuestions([
        { id: "q1", kind: "short", label: "How many windows?", fieldName: "window_count" },
      ]),
    });
    expect(text).toContain("field: window_count");
    expect(text).not.toContain("how_many_windows");
  });

  it("marks an optional question and its length bounds", () => {
    const text = formToText({
      ...base,
      questions: cleanQuestions([
        { id: "q1", kind: "short", label: "Notes?", optional: true, minLength: 5, maxLength: 90 },
      ]),
    });
    expect(text).toContain("(optional, min 5, max 90)");
  });

  it("says a choice takes more than one answer", () => {
    const text = formToText({
      ...base,
      questions: cleanQuestions([
        { id: "q1", kind: "choice", label: "What?", multiSelect: true, options: [{ label: "A" }] },
      ]),
    });
    expect(text).toContain("[Multiple choice, multi-select]");
  });

  it("writes a list intro one bullet to a line", () => {
    const text = formToText({
      ...base,
      introHeadline: "Free quote",
      introDescription: "No obligation\nSame week",
      introLayout: "list",
    });
    expect(text).toContain("Layout: list");
    expect(text).toContain("  - No obligation");
    expect(text).toContain("  - Same week");
  });

  it("says so when there are no questions yet", () => {
    expect(formToText(base)).toContain("(none yet)");
  });

  it("prints the completion block when any part of it is written", () => {
    const text = formToText({ ...base, completionCta: "View website" });
    expect(text).toContain("COMPLETION");
    expect(text).toContain("Button: View website");
  });

  it("prints only the field the button kind actually uses", () => {
    const calling = formToText({
      ...base,
      completionCtaType: "call_business",
      completionUrl: "https://willis.com",
      completionPhone: "(609) 555 0142",
    });
    expect(calling).toContain("Phone: (609) 555 0142");
    expect(calling).not.toContain("URL:");

    const linking = formToText({
      ...base,
      completionCtaType: "view_website",
      completionUrl: "https://willis.com",
      completionPhone: "(609) 555 0142",
    });
    expect(linking).toContain("URL: https://willis.com");
    expect(linking).not.toContain("Phone:");
  });

  it("prints the consents as ticks, each marked required or optional", () => {
    const text = formToText({
      ...base,
      privacyUrl: "https://willis.com/privacy",
      privacyLinkText: "Our privacy policy",
      consents: [
        { text: "Text me", optional: false },
        { text: "Send me offers", optional: true },
      ],
    });
    expect(text).toContain('shown as "Our privacy policy"');
    expect(text).toContain("[ ] Text me   (required)");
    expect(text).toContain("[ ] Send me offers   (optional)");
  });

  it("prints the tracking parameters", () => {
    const text = formToText({ ...base, trackingParams: [{ key: "source", value: "storm_q3" }] });
    expect(text).toContain("TRACKING PARAMETERS");
    expect(text).toContain("source = storm_q3");
  });
});

describe("guards", () => {
  it("accepts Meta's three form types and nothing else", () => {
    expect(isLeadFormIntent("more_volume")).toBe(true);
    expect(isLeadFormIntent("higher_intent")).toBe(true);
    expect(isLeadFormIntent("rich_creative")).toBe(true);
    expect(isLeadFormIntent("volume")).toBe(false);
  });

  it("accepts Meta's five question kinds and nothing else", () => {
    for (const kind of ["prefill", "short", "choice", "appointment", "store_locator"]) {
      expect(isLeadQuestionKind(kind)).toBe(true);
    }
    expect(isLeadQuestionKind("dropdown")).toBe(false);
  });
});

describe("cleanFieldName", () => {
  it("narrows anything typed into a key", () => {
    expect(cleanFieldName("How many windows?")).toBe("how_many_windows");
    expect(cleanFieldName("  --Budget--  ")).toBe("budget");
    expect(cleanFieldName(12)).toBe("");
  });

  it("caps it", () => {
    expect(cleanFieldName("a".repeat(200))).toHaveLength(FORM_LIMITS.fieldName);
  });
});

describe("defaultFieldName", () => {
  it("derives a key from the label", () => {
    expect(defaultFieldName({ kind: "short", label: "How many windows?", prefill: "" })).toBe(
      "how_many_windows",
    );
  });

  it("derives a prefill's key from the field, not the wording around it", () => {
    expect(
      defaultFieldName({ kind: "prefill", label: "What is your email?", prefill: "Work email" }),
    ).toBe("work_email");
  });
});

describe("cleanConsents", () => {
  it("keeps the text and whether it may be skipped", () => {
    expect(cleanConsents([{ text: "Text me", optional: true }])).toEqual([
      { text: "Text me", optional: true },
    ]);
  });

  it("drops a tick with no wording and caps the list", () => {
    expect(cleanConsents([{ text: " " }, { text: "Real" }])).toHaveLength(1);
    const many = Array.from({ length: FORM_LIMITS.consents + 3 }, (_, i) => ({ text: `c${i}` }));
    expect(cleanConsents(many)).toHaveLength(FORM_LIMITS.consents);
  });
});

describe("cleanTrackingParams", () => {
  it("narrows the key and keeps the value as typed", () => {
    expect(cleanTrackingParams([{ key: "Ad Set", value: "Storm Q3" }])).toEqual([
      { key: "ad_set", value: "Storm Q3" },
    ]);
  });

  it("drops a value with no key, and keeps a key still being filled in", () => {
    expect(cleanTrackingParams([{ key: "", value: "orphan" }])).toEqual([]);
    expect(cleanTrackingParams([{ key: "source", value: "" }])).toEqual([
      { key: "source", value: "" },
    ]);
  });
});

describe("new question kinds", () => {
  it("keeps an appointment request that has no wording of its own", () => {
    const qs = cleanQuestions([{ id: "q1", kind: "appointment", label: "" }]);
    expect(qs).toHaveLength(1);
    expect(qs[0].kind).toBe("appointment");
  });

  it("keeps the inline context only on the kinds that show one", () => {
    expect(
      cleanQuestions([{ kind: "appointment", label: "When?", inlineContext: "Mon to Fri" }])[0]
        .inlineContext,
    ).toBe("Mon to Fri");
    expect(
      cleanQuestions([{ kind: "short", label: "When?", inlineContext: "Mon to Fri" }])[0]
        .inlineContext,
    ).toBe("");
  });

  it("keeps multi-select only on a choice", () => {
    expect(
      cleanQuestions([{ kind: "choice", label: "?", multiSelect: true, options: [{ label: "A" }] }])[0]
        .multiSelect,
    ).toBe(true);
    expect(cleanQuestions([{ kind: "short", label: "?", multiSelect: true }])[0].multiSelect).toBe(
      false,
    );
  });

  it("drops a length pair nobody could satisfy", () => {
    const q = cleanQuestions([{ kind: "short", label: "?", minLength: 90, maxLength: 5 }])[0];
    expect(q.minLength).toBe(0);
    expect(q.maxLength).toBe(0);
  });

  it("treats a nonsense length as unset rather than throwing", () => {
    const q = cleanQuestions([{ kind: "short", label: "?", minLength: "ten", maxLength: -4 }])[0];
    expect(q.minLength).toBe(0);
    expect(q.maxLength).toBe(0);
  });
});
