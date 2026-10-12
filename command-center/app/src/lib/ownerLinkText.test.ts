import { describe, expect, it } from "vitest";
import { ownerLinkText } from "./ownerLinkText";

describe("ownerLinkText", () => {
  it("adds the lead's contact id to the custom value tag", () => {
    expect(ownerLinkText("{{custom_values.call_now_link}}")).toBe(
      "{{custom_values.call_now_link}}&c={{contact.id}}",
    );
  });
});
