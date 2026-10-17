import { describe, it, expect } from "vitest";
import { parseChatMarkdown, parseInline, safeHref } from "./chatMarkdown";

describe("parseInline", () => {
  it("is plain text when there is nothing to mark", () => {
    expect(parseInline("Hello there")).toEqual([{ t: "text", v: "Hello there" }]);
  });

  it("reads bold and code", () => {
    expect(parseInline("A **big** win in `index.html`")).toEqual([
      { t: "text", v: "A " },
      { t: "bold", c: [{ t: "text", v: "big" }] },
      { t: "text", v: " win in " },
      { t: "code", v: "index.html" },
    ]);
  });

  it("keeps markers inside code as text", () => {
    expect(parseInline("`**not bold**`")).toEqual([{ t: "code", v: "**not bold**" }]);
  });

  it("nests code inside bold", () => {
    expect(parseInline("**run `x`**")).toEqual([{ t: "bold", c: [{ t: "text", v: "run " }, { t: "code", v: "x" }] }]);
  });

  it("leaves an unclosed marker as it is", () => {
    expect(parseInline("2 ** 3 and `open")).toEqual([{ t: "text", v: "2 ** 3 and `open" }]);
    expect(parseInline("****")).toEqual([{ t: "text", v: "****" }]);
  });

  it("links https only", () => {
    expect(parseInline("See [the page](https://hm-a.pages.dev/x?y=1).")).toEqual([
      { t: "text", v: "See " },
      { t: "link", href: "https://hm-a.pages.dev/x?y=1", c: [{ t: "text", v: "the page" }] },
      { t: "text", v: "." },
    ]);
    for (const bad of ["javascript:alert(1)", "http://x.com", "data:text/html,hi", "//x.com"]) {
      expect(parseInline(`[click](${bad})`), bad).toEqual([{ t: "text", v: "click" }]);
    }
  });

  it("links a bare https URL without its trailing full stop", () => {
    expect(parseInline("Live at https://hm-a.pages.dev.")).toEqual([
      { t: "text", v: "Live at " },
      { t: "link", href: "https://hm-a.pages.dev", c: [{ t: "text", v: "https://hm-a.pages.dev" }] },
      { t: "text", v: "." },
    ]);
    expect(parseInline("(https://a.dev)")).toEqual([
      { t: "text", v: "(" },
      { t: "link", href: "https://a.dev", c: [{ t: "text", v: "https://a.dev" }] },
      { t: "text", v: ")" },
    ]);
  });

  it("does not link http or a URL glued to a word", () => {
    expect(parseInline("http://a.dev")).toEqual([{ t: "text", v: "http://a.dev" }]);
    expect(parseInline("xhttps://a.dev")).toEqual([{ t: "text", v: "xhttps://a.dev" }]);
  });
});

describe("safeHref", () => {
  it("accepts https and nothing else", () => {
    expect(safeHref("https://a.dev/x")).toBe("https://a.dev/x");
    for (const bad of ["HTTPS://a.dev", "http://a.dev", "javascript:x", "https:/a", " https://a.dev", "https://"]) {
      expect(safeHref(bad), bad).toBeNull();
    }
  });
});

describe("parseChatMarkdown", () => {
  it("splits paragraphs on blank lines and keeps single line breaks", () => {
    expect(parseChatMarkdown("One\ntwo\n\nThree")).toEqual([
      { t: "p", lines: [[{ t: "text", v: "One" }], [{ t: "text", v: "two" }]] },
      { t: "p", lines: [[{ t: "text", v: "Three" }]] },
    ]);
  });

  it("reads numbered and bulleted lists", () => {
    expect(parseChatMarkdown("Plan:\n1. Headline\n2. **Offer**\n\n- a\n* b")).toEqual([
      { t: "p", lines: [[{ t: "text", v: "Plan:" }]] },
      {
        t: "ol",
        start: 1,
        items: [[{ t: "text", v: "Headline" }], [{ t: "bold", c: [{ t: "text", v: "Offer" }] }]],
      },
      { t: "ul", items: [[{ t: "text", v: "a" }], [{ t: "text", v: "b" }]] },
    ]);
  });

  it("keeps a numbered list whole across blank lines and from its own start", () => {
    expect(parseChatMarkdown("3. c\n\n4. d")).toEqual([
      { t: "ol", start: 3, items: [[{ t: "text", v: "c" }], [{ t: "text", v: "d" }]] },
    ]);
  });

  it("folds an indented line into the list item above", () => {
    expect(parseChatMarkdown("1. Hero\n   big photo\n2. Form")).toEqual([
      {
        t: "ol",
        start: 1,
        items: [[{ t: "text", v: "Hero big photo" }], [{ t: "text", v: "Form" }]],
      },
    ]);
  });

  it("shows a heading as a bold line", () => {
    expect(parseChatMarkdown("## Next steps")).toEqual([
      { t: "p", lines: [[{ t: "bold", c: [{ t: "text", v: "Next steps" }] }]] },
    ]);
  });

  it("is empty for empty text and copes with CRLF", () => {
    expect(parseChatMarkdown("")).toEqual([]);
    expect(parseChatMarkdown("a\r\n\r\nb")).toHaveLength(2);
  });

  it("never turns text into markup it was not asked for", () => {
    const blocks = parseChatMarkdown('<img src=x onerror="alert(1)"> & <b>hi</b>');
    expect(blocks).toEqual([{ t: "p", lines: [[{ t: "text", v: '<img src=x onerror="alert(1)"> & <b>hi</b>' }]] }]);
  });
});
