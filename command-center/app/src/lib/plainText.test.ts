import { describe, expect, it } from "vitest";
import { toPlainText } from "./plainText";

describe("toPlainText", () => {
  // The exact note that sent a setter looking at tag soup in the cockpit.
  it("flattens a real form-submission note to readable lines", () => {
    const note =
      '<p style="padding-left: 0px!important;"><strong><em>First Name: </em></strong>Lisa<br></p>' +
      '<p style="padding-left: 0px!important;"><strong><em>Phone: </em></strong>(313) 460-1526<br></p>' +
      '<p style="padding-left: 0px!important;"><strong><em>Address: </em></strong></p>';
    expect(toPlainText(note)).toBe("First Name: Lisa\nPhone: (313) 460-1526\nAddress:");
  });

  it("leaves plain text exactly as it was", () => {
    expect(toPlainText("Called, no answer. Try after 5.")).toBe("Called, no answer. Try after 5.");
  });

  it("does not mistake a comparison for markup", () => {
    expect(toPlainText("quote < 500 so they walked")).toBe("quote < 500 so they walked");
  });

  it("decodes the entities a form builder emits", () => {
    expect(toPlainText("<p>Tom &amp; Jerry&nbsp;Ltd &#8212; 5&quot; gutters</p>")).toBe(
      'Tom & Jerry Ltd - 5" gutters',
    );
  });

  it("drops script and style content rather than printing it", () => {
    expect(toPlainText("<div>Keep<style>.x{color:red}</style><script>alert(1)</script></div>")).toBe(
      "Keep",
    );
  });

  it("turns list items into their own lines", () => {
    expect(toPlainText("<ul><li>Windows</li><li>Gutters</li></ul>")).toBe("Windows\nGutters");
  });

  it("never leaves more than one blank line", () => {
    expect(toPlainText("<p>One</p><div><p></p></div><p>Two</p>")).toBe("One\n\nTwo");
  });

  it("handles empty, null and undefined", () => {
    expect(toPlainText("")).toBe("");
    expect(toPlainText(null)).toBe("");
    expect(toPlainText(undefined)).toBe("");
    expect(toPlainText("<p></p>")).toBe("");
  });
});
