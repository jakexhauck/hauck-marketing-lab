import { describe, it, expect } from "vitest";
import {
  formatFieldValue,
  isDeniedField,
  organicChannel,
  readableAnswers,
  resolveOrganicPipeline,
} from "./organic";

// The live Willis shape, copied from GHL 2026-08-02. Kept verbatim so a change
// to the real pipeline shows up here as a failing test rather than as an empty
// page nobody notices.
const LIVE_PIPELINES = [
  { id: "jrQQItCcwN6p7VUIhdRC", name: "1) Leads", stages: [{ id: "a", name: "Lead Form Opt In" }] },
  { id: "wLE6lxlQtRDNZjkmUrEX", name: "4) Trash", stages: [{ id: "b", name: "DND" }] },
  {
    id: "ElzjlzovQewPnhpXq7Pj",
    name: "Organic",
    stages: [
      { id: "5d3710a5-b9a9-483f-adf7-93ad0efa2de2", name: "Chat Widget" },
      { id: "836d964a-2f94-422d-a7e8-bfc674ff5890", name: "Estimate Form" },
    ],
  },
];

describe("resolveOrganicPipeline", () => {
  it("finds the live Organic pipeline and maps its stages", () => {
    const resolved = resolveOrganicPipeline(LIVE_PIPELINES);
    expect(resolved?.pipelineId).toBe("ElzjlzovQewPnhpXq7Pj");
    expect(resolved?.stageNames.get("5d3710a5-b9a9-483f-adf7-93ad0efa2de2")).toBe("Chat Widget");
    expect(resolved?.stageNames.get("836d964a-2f94-422d-a7e8-bfc674ff5890")).toBe("Estimate Form");
  });

  it("matches a renamed pipeline that still contains 'organic'", () => {
    const resolved = resolveOrganicPipeline([{ id: "x", name: "Organic Leads", stages: [] }]);
    expect(resolved?.pipelineId).toBe("x");
  });

  it("prefers the exact name over a contains match", () => {
    const resolved = resolveOrganicPipeline([
      { id: "loose", name: "Organic Archive", stages: [] },
      { id: "exact", name: "Organic", stages: [] },
    ]);
    expect(resolved?.pipelineId).toBe("exact");
  });

  // A client whose website we do not manage has no Organic pipeline. Returning
  // null is what hides the nav row, so this is the test that keeps the page from
  // appearing empty for everybody else.
  it("returns null when the tenant has no Organic pipeline", () => {
    expect(resolveOrganicPipeline([{ id: "y", name: "1) Leads", stages: [] }])).toBeNull();
  });
});

describe("organicChannel", () => {
  it("classifies the two live stage names", () => {
    expect(organicChannel("Chat Widget")).toBe("chat");
    expect(organicChannel("Estimate Form")).toBe("form");
  });

  it("tolerates casing and agency numbering", () => {
    expect(organicChannel("  1) CHAT WIDGET ")).toBe("chat");
    expect(organicChannel("Website Estimate Form")).toBe("form");
  });

  // A lead sitting in a stage we do not recognise must still surface somewhere.
  it("buckets an unknown stage as other rather than dropping it", () => {
    expect(organicChannel("Phone Call")).toBe("other");
    expect(organicChannel("")).toBe("other");
  });
});

describe("isDeniedField", () => {
  it("blocks the agency CRM credential fields", () => {
    expect(isDeniedField("contact.password_to_use_for_crm_login")).toBe(true);
    expect(isDeniedField("contact.email_to_use_for_crm_login")).toBe(true);
  });

  it("blocks any field mentioning a password, listed or not", () => {
    expect(isDeniedField("contact.some_new_password_field")).toBe(true);
  });

  it("blocks automation scratch fields", () => {
    expect(isDeniedField("contact.ai_response")).toBe(true);
    expect(isDeniedField("contact.thread")).toBe(true);
  });

  it("allows genuine lead answers", () => {
    expect(isDeniedField("contact.what_is_the_scope_of_this_project")).toBe(false);
    expect(isDeniedField("contact.street_address")).toBe(false);
    expect(isDeniedField("contact.timeline_for_project")).toBe(false);
  });
});

describe("formatFieldValue", () => {
  it("renders a checkbox array as one line", () => {
    expect(formatFieldValue(["Windows", "Gutters"])).toBe("Windows, Gutters");
  });

  it("trims strings and drops empties", () => {
    expect(formatFieldValue("  48127 ")).toBe("48127");
    expect(formatFieldValue("   ")).toBe("");
    expect(formatFieldValue(null)).toBe("");
    expect(formatFieldValue(undefined)).toBe("");
  });

  it("keeps numbers and booleans", () => {
    expect(formatFieldValue(0)).toBe("0");
    expect(formatFieldValue(false)).toBe("false");
  });
});

describe("readableAnswers", () => {
  const defs = [
    { id: "f1", name: "What is the scope of this project?", fieldKey: "contact.what_is_the_scope_of_this_project" },
    { id: "f2", name: "Street Address", fieldKey: "contact.street_address" },
    { id: "f3", name: "Password to use for CRM login", fieldKey: "contact.password_to_use_for_crm_login" },
    { id: "f4", name: "Notes", fieldKey: "contact.notes" },
  ];

  it("labels populated fields in definition order", () => {
    const answers = readableAnswers(
      [
        { id: "f2", value: "123 Main St" },
        { id: "f1", value: "Whole house" },
      ],
      defs,
    );
    expect(answers).toEqual([
      { label: "What is the scope of this project?", value: "Whole house" },
      { label: "Street Address", value: "123 Main St" },
    ]);
  });

  it("never renders a denied field even when populated", () => {
    const answers = readableAnswers([{ id: "f3", value: "hunter2" }], defs);
    expect(answers).toEqual([]);
  });

  it("drops fields whose value is blank", () => {
    const answers = readableAnswers([{ id: "f4", value: "   " }], defs);
    expect(answers).toEqual([]);
  });

  it("returns nothing when the contact has no custom fields", () => {
    expect(readableAnswers([], defs)).toEqual([]);
    expect(readableAnswers(undefined, defs)).toEqual([]);
  });
});
