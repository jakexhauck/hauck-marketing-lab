import { describe, expect, it } from "vitest";
import { ownerLinkText } from "./ownerLinkText";

describe("ownerLinkText", () => {
  it("adds the lead's contact id to the end of the owner link URL", () => {
    expect(ownerLinkText("https://app.hauckmarketing.com/api/call-now?l=abc&k=123")).toBe(
      "https://app.hauckmarketing.com/api/call-now?l=abc&k=123&c={{contact.id}}",
    );
  });
});
