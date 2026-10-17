import { describe, it, expect } from "vitest";
import { docToMarkdown, markdownToDoc, markdownToPlain, type DocNode } from "./briefMarkdown";

const rt = (md: string) => docToMarkdown(markdownToDoc(md));

describe("markdownToDoc / docToMarkdown round trip", () => {
  // Every format the toolbar can make, as the serializer writes it.
  const cases: [string, string][] = [
    ["paragraph", "Winter offer is live."],
    ["two paragraphs", "First.\n\nSecond."],
    ["heading 1", "# Offer"],
    ["heading 2", "## Offer"],
    ["heading 3", "### Offer"],
    ["bold", "Cap is __$40/day__ for now."],
    ["italic", "Owner says *never* affordable."],
    ["underline", "Read <u>this</u> first."],
    ["bold italic", "__*both*__ at once"],
    ["bold then italic", "__a__*b*"],
    ["code", "Value `winter_link` in GHL."],
    ["link", "See [the page](https://hm-willis.pages.dev) now."],
    ["bold link", "[__Live page__](https://hm-willis.pages.dev)"],
    ["bullets", "- one\n- two\n- three"],
    ["numbered", "1. one\n2. two"],
    ["numbered from 3", "3. three\n4. four"],
    ["nested bullets", "- one\n  - inner\n- two"],
    ["nested in numbered", "1. one\n   - inner\n2. two"],
    ["line break", "Line one\nLine two"],
    ["mixed blocks", "## Ads\n\n- Cap __$40__\n- Fall CPL $41\n\nRefresh due."],
    ["escapes", "5 \\* 3, snake\\_case, \\[x\\], a \\\\ b, \\<u>"],
    ["line-start escapes", "\\# not a heading\n\\- not a list\n1\\. not a number"],
    ["formatted list item", "- __Top pain:__ door fails in the *cold*"],
    ["empty", ""],
  ];
  for (const [name, md] of cases) {
    it(name, () => expect(rt(md)).toBe(md));
  }

  it("is stable from the editor side too", () => {
    for (const [, md] of cases) {
      const doc = markdownToDoc(md);
      expect(markdownToDoc(docToMarkdown(doc)), md).toEqual(doc);
    }
  });
});

describe("markdownToDoc", () => {
  it("builds Tiptap nodes", () => {
    expect(markdownToDoc("## Ads\n\n- __Cap__ [x](https://a.com)")).toEqual({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Ads" }] },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "Cap", marks: [{ type: "bold" }] },
                    { type: "text", text: " " },
                    { type: "text", text: "x", marks: [{ type: "link", attrs: { href: "https://a.com" } }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("reads what agents write: ** bold, * bullets, _ italic", () => {
    expect(rt("**Cap** and _soft_\n* one\n* two")).toBe("__Cap__ and *soft*\n\n- one\n- two");
  });

  it("leaves an underscore inside a word alone", () => {
    expect(markdownToPlain("snake_case_name")).toBe("snake_case_name");
  });

  it("keeps a link that is not http(s) or mailto as plain text", () => {
    const doc = markdownToDoc("[x](javascript:alert(1))");
    const text = JSON.stringify(doc);
    expect(text).not.toContain('"link"');
  });

  it("keeps unknown blocks as text", () => {
    expect(markdownToPlain("> quoted")).toBe("> quoted");
  });
});

describe("docToMarkdown", () => {
  it("drops empty paragraphs the editor leaves between blocks", () => {
    const doc: DocNode = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "a" }] },
        { type: "paragraph" },
        { type: "paragraph", content: [{ type: "text", text: "b" }] },
      ],
    };
    expect(docToMarkdown(doc)).toBe("a\n\nb");
  });

  it("joins neighbours that share a link into one link", () => {
    const link = { type: "link", attrs: { href: "https://a.com", target: "_blank" } };
    const doc: DocNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "go ", marks: [link] },
            { type: "text", text: "now", marks: [link, { type: "bold" }] },
          ],
        },
      ],
    };
    expect(docToMarkdown(doc)).toBe("[go __now__](https://a.com)");
  });
});

describe("markdownToPlain", () => {
  it("is the text with the marks taken out, for the Drive Doc", () => {
    expect(markdownToPlain("__Cap__ is *firm*, see [page](https://a.com)\n\n- one\n- two\n\n1. first")).toBe(
      "Cap is firm, see page (https://a.com)\n• one\n• two\n1. first",
    );
  });
});
