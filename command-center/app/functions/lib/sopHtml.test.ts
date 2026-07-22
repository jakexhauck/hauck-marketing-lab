import { describe, it, expect } from "vitest";
import { cleanDocHtml, extractTitle } from "./sopHtml";

// Google's text/html export is hostile: a full document with a <style> block,
// inline styles on every node, generated class names (c3 c17), and <span> soup
// wrapping every run of text. These tests pin the reduction to a clean subset,
// because this is the piece most likely to break on a Doc we have not seen.

describe("cleanDocHtml", () => {
  it("keeps only the body and drops the head", () => {
    const html = `<html><head><meta content="text/html"><style>.c1{color:red}</style></head><body><p>Step one</p></body></html>`;
    expect(cleanDocHtml(html)).toBe("<p>Step one</p>");
  });

  it("strips style, class and id attributes", () => {
    const html = `<p class="c3 c17" style="margin:0;padding:9pt" id="h.abc">Call the lead</p>`;
    expect(cleanDocHtml(html)).toBe("<p>Call the lead</p>");
  });

  it("unwraps spans that carry no meaning", () => {
    const html = `<p><span class="c1">Open </span><span class="c2">Ads Manager</span></p>`;
    expect(cleanDocHtml(html)).toBe("<p>Open Ads Manager</p>");
  });

  it("preserves semantic tags", () => {
    const html = `<body><h2>Setup</h2><ul><li><strong>Pixel</strong> then <em>events</em></li></ul></body>`;
    expect(cleanDocHtml(html)).toBe("<h2>Setup</h2><ul><li><strong>Pixel</strong> then <em>events</em></li></ul>");
  });

  it("preserves tables", () => {
    const html = `<table style="border:1px"><tbody><tr><td class="c1">Budget</td><td>50</td></tr></tbody></table>`;
    expect(cleanDocHtml(html)).toBe("<table><tbody><tr><td>Budget</td><td>50</td></tr></tbody></table>");
  });

  it("unwraps Google's redirect wrapper on links but keeps the href", () => {
    const html = `<a class="c4" href="https://www.google.com/url?q=https://ads.example.com/setup&amp;sa=D&amp;source=editors">Ads Manager</a>`;
    expect(cleanDocHtml(html)).toBe(`<a href="https://ads.example.com/setup" target="_blank" rel="noopener noreferrer">Ads Manager</a>`);
  });

  it("leaves a plain href alone but still hardens the target", () => {
    const html = `<a href="https://example.com/doc">Doc</a>`;
    expect(cleanDocHtml(html)).toBe(`<a href="https://example.com/doc" target="_blank" rel="noopener noreferrer">Doc</a>`);
  });

  it("drops a javascript: href rather than rendering it", () => {
    const html = `<a href="javascript:alert(1)">Click</a>`;
    expect(cleanDocHtml(html)).toBe("Click");
  });

  it("removes script tags and their contents", () => {
    const html = `<body><p>Safe</p><script>steal()</script></body>`;
    expect(cleanDocHtml(html)).toBe("<p>Safe</p>");
  });

  it("removes an onerror handler smuggled onto an image", () => {
    const html = `<img src="https://example.com/a.png" onerror="steal()">`;
    expect(cleanDocHtml(html)).toBe(`<img src="https://example.com/a.png">`);
  });

  it("drops empty paragraphs left behind by the export", () => {
    const html = `<p>Real</p><p><span></span></p><p>&nbsp;</p><p>More</p>`;
    expect(cleanDocHtml(html)).toBe("<p>Real</p><p>More</p>");
  });

  it("preserves entities in text", () => {
    const html = `<p>Spend &lt; 50 &amp; margin &gt; 30</p>`;
    expect(cleanDocHtml(html)).toBe("<p>Spend &lt; 50 &amp; margin &gt; 30</p>");
  });

  it("returns an empty string for empty or malformed input", () => {
    expect(cleanDocHtml("")).toBe("");
    expect(cleanDocHtml("<p>unclosed")).toBe("<p>unclosed</p>");
    expect(cleanDocHtml("<<>>")).toBe("");
  });
});

// Google puts bold and italic in the <style> block as generated class names, not
// as <strong>/<em>. Stripping classes without reading that block first would flatten
// every SOP into unformatted grey text.
describe("cleanDocHtml emphasis recovery", () => {
  const style = `<style>.c1{font-weight:700}.c2{font-style:italic}.c3{color:#000}</style>`;

  it("promotes a bold class to strong", () => {
    const html = `<html><head>${style}</head><body><p><span class="c1">Never</span> skip this</p></body></html>`;
    expect(cleanDocHtml(html)).toBe("<p><strong>Never</strong> skip this</p>");
  });

  it("promotes an italic class to em", () => {
    const html = `<html><head>${style}</head><body><p><span class="c2">roughly</span></p></body></html>`;
    expect(cleanDocHtml(html)).toBe("<p><em>roughly</em></p>");
  });

  it("nests both when a class carries each", () => {
    const html = `<html><head>${style}</head><body><p><span class="c1 c2">Critical</span></p></body></html>`;
    expect(cleanDocHtml(html)).toBe("<p><strong><em>Critical</em></strong></p>");
  });

  it("leaves non-emphasis classes as plain text", () => {
    const html = `<html><head>${style}</head><body><p><span class="c3">Plain</span></p></body></html>`;
    expect(cleanDocHtml(html)).toBe("<p>Plain</p>");
  });

  it("treats font-weight:bold the same as a numeric weight", () => {
    const html = `<html><head><style>.b{font-weight:bold}</style></head><body><p><span class="b">Hi</span></p></body></html>`;
    expect(cleanDocHtml(html)).toBe("<p><strong>Hi</strong></p>");
  });
});

describe("extractTitle", () => {
  it("reads the document title", () => {
    expect(extractTitle("<html><head><title>Facebook Pixel SOP</title></head><body></body></html>")).toBe("Facebook Pixel SOP");
  });

  it("falls back to null when there is no title", () => {
    expect(extractTitle("<body><p>x</p></body>")).toBeNull();
  });
});
