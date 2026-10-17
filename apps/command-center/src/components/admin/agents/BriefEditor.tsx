import { useEffect, useReducer, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import {
  Bold,
  Check,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Redo2,
  Underline as UnderlineIcon,
  Undo2,
  X,
} from "lucide-react";
import { docToMarkdown, markdownToDoc, type DocNode } from "../../../lib/briefMarkdown";
import { briefExtensions, SAFE_HREF } from "../../../lib/briefExtensions";

// The Client Brief's editor: Google Docs style, click and type, no edit mode.
// Tiptap holds the document while Jake types; what is stored is markdown
// (lib/briefMarkdown.ts), so every change is turned back into markdown and
// handed up, and markdown is only loaded INTO the editor when `external`
// moves (a newer copy, a conflict, Use mine: lib/briefDraft.ts). Jake's own
// typing never reloads it, so his cursor stays put.
//
// The extensions are lib/briefExtensions.ts, the same ones its schema test uses.

export function BriefEditor({
  markdown,
  external,
  onChange,
  onFocus,
  label,
}: {
  markdown: string;
  external: number;
  onChange: (md: string) => void;
  onFocus?: (editor: Editor) => void;
  label: string;
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;
  const mdRef = useRef(markdown);
  mdRef.current = markdown;

  const editor = useEditor({
    extensions: briefExtensions(),
    content: markdownToDoc(markdown),
    editorProps: { attributes: { class: "brf-doc", "aria-label": label, role: "textbox", "aria-multiline": "true" } },
    onUpdate: ({ editor: e }) => onChangeRef.current(docToMarkdown(e.getJSON() as DocNode)),
    onFocus: ({ editor: e }) => onFocusRef.current?.(e),
  });

  // Refill from outside only. The first run is the mount, already loaded.
  const loaded = useRef(external);
  useEffect(() => {
    if (!editor || loaded.current === external) return;
    loaded.current = external;
    editor.commands.setContent(markdownToDoc(mdRef.current), false);
  }, [editor, external]);

  return <EditorContent editor={editor} />;
}

const HEADINGS = [
  { value: "0", label: "Normal text" },
  { value: "1", label: "Heading 1" },
  { value: "2", label: "Heading 2" },
  { value: "3", label: "Heading 3" },
];

function blockOf(editor: Editor | null): string {
  if (!editor) return "0";
  for (const l of [1, 2, 3]) if (editor.isActive("heading", { level: l })) return String(l);
  return "0";
}

// One toolbar for the whole brief, as in Google Docs: it works on whichever
// section was last clicked into.
export function BriefToolbar({ editor }: { editor: Editor | null }) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!editor) return;
    editor.on("transaction", rerender);
    editor.on("focus", rerender);
    return () => {
      editor.off("transaction", rerender);
      editor.off("focus", rerender);
    };
  }, [editor]);

  const [linking, setLinking] = useState(false);
  const [href, setHref] = useState("");
  const on = (name: string) => !!editor?.isActive(name);
  const chain = () => editor!.chain().focus();
  const off = !editor || editor.isDestroyed;

  const openLink = () => {
    if (!editor) return;
    setHref(String(editor.getAttributes("link").href ?? ""));
    setLinking(true);
  };
  const applyLink = () => {
    if (!editor) return;
    const url = href.trim();
    if (!url) chain().extendMarkRange("link").unsetLink().run();
    else if (SAFE_HREF.test(url)) chain().extendMarkRange("link").setLink({ href: url }).run();
    else
      chain()
        .extendMarkRange("link")
        .setLink({ href: `https://${url}` })
        .run();
    setLinking(false);
  };

  const btn = (title: string, active: boolean, run: () => void, Icon: typeof Bold, disabled = off) => (
    <button
      type="button"
      className={`brf-tb${active ? " on" : ""}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      // Keep the editor's selection: a mousedown on the button would blur it.
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      <Icon />
    </button>
  );

  return (
    <div className="brf-toolbar" role="toolbar" aria-label="Formatting">
      {btn("Undo (Ctrl+Z)", false, () => chain().undo().run(), Undo2, off || !editor.can().undo())}
      {btn("Redo (Ctrl+Y)", false, () => chain().redo().run(), Redo2, off || !editor.can().redo())}
      <span className="brf-tb-sep" />
      <select
        className="brf-tb-select"
        aria-label="Text style"
        disabled={off}
        value={blockOf(editor)}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (v === 0) chain().setParagraph().run();
          else
            chain()
              .setHeading({ level: v as 1 | 2 | 3 })
              .run();
        }}
      >
        {HEADINGS.map((h) => (
          <option key={h.value} value={h.value}>
            {h.label}
          </option>
        ))}
      </select>
      <span className="brf-tb-sep" />
      {btn("Bold (Ctrl+B)", on("bold"), () => chain().toggleBold().run(), Bold)}
      {btn("Italic (Ctrl+I)", on("italic"), () => chain().toggleItalic().run(), Italic)}
      {btn("Underline (Ctrl+U)", on("underline"), () => chain().toggleUnderline().run(), UnderlineIcon)}
      {btn("Link", on("link"), openLink, LinkIcon)}
      <span className="brf-tb-sep" />
      {btn("Bulleted list", on("bulletList"), () => chain().toggleBulletList().run(), List)}
      {btn("Numbered list", on("orderedList"), () => chain().toggleOrderedList().run(), ListOrdered)}
      {linking && (
        <span className="brf-linkbox">
          <input
            autoFocus
            value={href}
            placeholder="https://"
            aria-label="Link"
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              }
              if (e.key === "Escape") setLinking(false);
            }}
          />
          <button type="button" className="brf-tb" title="Apply" aria-label="Apply" onClick={applyLink}>
            <Check />
          </button>
          <button type="button" className="brf-tb" title="Cancel" aria-label="Cancel" onClick={() => setLinking(false)}>
            <X />
          </button>
        </span>
      )}
    </div>
  );
}
