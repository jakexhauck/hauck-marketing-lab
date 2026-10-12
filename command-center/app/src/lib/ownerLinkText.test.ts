import { describe, expect, it } from "vitest";
import { NEW_LEAD_TEXT, ownerLinkText } from "./ownerLinkText";

describe("ownerLinkText", () => {
  it("adds the lead's contact id to the custom value tag", () => {
    expect(ownerLinkText("{{custom_values.call_now_link}}")).toBe(
      "{{custom_values.call_now_link}}&c={{contact.id}}",
    );
  });
});

describe("Outcome Wiring", () => {
  it("puts Open Lead in the new-lead text, contact id on the end", () => {
    expect(NEW_LEAD_TEXT).toContain("Open lead: {{custom_values.open_lead}}&c={{contact.id}}");
  });
});
