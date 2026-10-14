import { describe, it, expect } from "vitest";
import { countCompanyTokens, docExportToScript, fillCompanyName } from "./scriptTemplate";

const EXPORT = `<html><head><style>.c1{color:red}</style></head><body class="c2">
<p class="title" id="h.x" style="padding:0"><span style="font-weight:400">Script</span></p>
<p style="margin:0"><span style="font-weight:700;text-decoration:underline">Open + Context</span></p>
<p style="margin:0"><span style="font-size:14pt;font-weight:700">Caller:</span><span style="font-weight:400">&nbsp;Hey, this is [Your Name] with [Company Name].</span></p>
<hr style="page-break-before:always">
<p><span style="font-style:italic">(Pause)</span></p>
</body></html>`;

describe("docExportToScript", () => {
  const out = docExportToScript(EXPORT);

  it("drops the head and keeps the body", () => {
    expect(out).not.toContain("<style");
    expect(out).not.toContain("<body");
  });

  it("turns the title into a heading", () => {
    expect(out).toContain("<h2>Script</h2>");
  });

  it("keeps bold, underline and italic as tags", () => {
    expect(out).toContain("<strong><u>Open + Context</u></strong>");
    expect(out).toContain("<strong>Caller:</strong>");
    expect(out).toContain("<em>(Pause)</em>");
  });

  it("leaves no styled spans behind", () => {
    expect(out).not.toMatch(/<span/i);
  });

  it("replaces a page rule with a divider line", () => {
    expect(out).toContain("<p>________________</p>");
  });
});

describe("fillCompanyName", () => {
  it("fills both bracket styles, any case", () => {
    expect(fillCompanyName("with [Company Name] and {{ company name }}", "Willis Windows")).toBe(
      "with Willis Windows and Willis Windows",
    );
  });

  it("never touches the spots said live on the call", () => {
    expect(fillCompanyName("[First Name], this is [Your Name]", "AAG")).toBe("[First Name], this is [Your Name]");
  });

  it("escapes the name", () => {
    expect(fillCompanyName("[Company Name]", "A & B <Co>")).toBe("A &amp; B &lt;Co&gt;");
  });

  it("leaves the text alone with no name", () => {
    expect(fillCompanyName("[Company Name]", " ")).toBe("[Company Name]");
  });
});

describe("countCompanyTokens", () => {
  it("counts the spots", () => {
    expect(countCompanyTokens("[Company Name] x {{Company Name}} [Your Name]")).toBe(2);
  });
});
