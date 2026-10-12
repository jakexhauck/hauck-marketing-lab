import { describe, expect, it } from "vitest";
import { NEW_LEAD_TEXT, ownerLinkText, wiringLinks } from "./ownerLinkText";

describe("ownerLinkText", () => {
  it("adds the lead's contact id to the custom value tag", () => {
    expect(ownerLinkText("{{custom_values.call_now_link}}")).toBe(
      "{{custom_values.call_now_link}}&c={{contact.id}}",
    );
  });
});

describe("Outcome Wiring", () => {
  it("puts the Lead Outcome Link in the new-lead text, contact id on the end", () => {
    expect(NEW_LEAD_TEXT).toContain("Open lead: {{custom_values.lead_outcome_link}}&c={{contact.id}}");
  });
  it("lists Lead Outcome first and hides Text Them", () => {
    const names = ["Call Now Link", "Lead Outcome Link", "Phone Appointment Call Now Link", "Text Them Link"];
    expect(wiringLinks(names.map((name) => ({ name }))).map((l) => l.name)).toEqual([
      "Lead Outcome Link",
      "Call Now Link",
      "Phone Appointment Call Now Link",
    ]);
  });
});
