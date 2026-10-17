import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";

// The Client Brief editor's extensions, kept out of the component so a test can
// build the same schema with no DOM (briefExtensions.test.ts) and check that
// what lib/briefMarkdown.ts makes is a document the editor accepts.
//
// Only what the converter can write is switched on: no quotes, code blocks,
// rules or strike-through, three heading levels.

export const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

export function briefExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      blockquote: false,
      codeBlock: false,
      horizontalRule: false,
      strike: false,
    }),
    Underline,
    Link.configure({
      openOnClick: false,
      autolink: true,
      validate: (href) => SAFE_HREF.test(href),
      HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
    }),
    Placeholder.configure({ placeholder: "Empty" }),
  ];
}
