import { describe, it, expect } from "vitest";
import { getSchema } from "@tiptap/core";
import { briefExtensions } from "./briefExtensions";
import { docToMarkdown, markdownToDoc, type DocNode } from "./briefMarkdown";

// The converter's documents, loaded into the editor's real schema and read
// back out of it, the way the editor does on every keystroke.
const schema = getSchema(briefExtensions());

const samples = [
  "Winter offer is live.",
  "# One\n\n## Two\n\n### Three",
  "__bold__ *italic* <u>under</u> `code` [link](https://a.com)",
  "__*both*__ and [__bold link__](https://a.com)",
  "- one\n  - inner\n- two",
  "3. three\n4. four\n   - inner",
  "Line one\nLine two",
  "5 \\* 3, snake\\_case, \\[x\\]\n\\# not a heading",
];

describe("brief editor schema", () => {
  for (const md of samples) {
    it(md.slice(0, 30), () => {
      const node = schema.nodeFromJSON(markdownToDoc(md));
      expect(() => node.check()).not.toThrow();
      expect(docToMarkdown(node.toJSON() as DocNode)).toBe(md);
    });
  }
});
