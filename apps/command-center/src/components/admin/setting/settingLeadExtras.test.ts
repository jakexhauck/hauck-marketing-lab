import { describe, it, expect } from "vitest";
import { hasText } from "./SettingLeadExtras";

describe("hasText", () => {
  it("shows notes only when they have words, not an editor's empty shell", () => {
    expect(hasText("")).toBe(false);
    expect(hasText("<p><br></p>")).toBe(false);
    expect(hasText("<p>&nbsp;</p><div> </div>")).toBe(false);
    expect(hasText("<p>Owner prefers mornings</p>")).toBe(true);
  });
});
