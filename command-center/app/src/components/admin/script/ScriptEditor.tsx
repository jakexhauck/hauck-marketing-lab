import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Pilcrow,
  RemoveFormatting,
  Underline,
} from "lucide-react";

// A formatted dialing-script editor, written like a doc (headings, bold, lists)
// and read back by the floating ScriptPanel. Used by the Setter Suite (one
// script per client) and by Cold Calling (one script for the agency); the only
// difference between them is where the html is loaded from and saved to, so
// that is all this takes as props.
//
// The editor is an UNCONTROLLED contenteditable: React never rewrites its
// innerHTML after the initial seed, because a re-render mid-keystroke resets the
// caret to the start. Callers key this component on whatever identifies the
// document (client id, say) so switching remounts and reseeds cleanly.
//
// Saving is debounced whole-document autosave with an unmount flush, so
// switching tab or client never drops typing.
//
// document.execCommand is deprecated on paper but universally supported, and it
// is the only dependency-free way to drive contenteditable formatting. The
// server-side sanitizer (functions/lib/setterScript.ts) is what bounds whatever
// markup it produces.

type SaveStatus = "idle" | "unsaved" | "saving" | "saved" | "error";

const STATUS_LABEL: Record<SaveStatus, string> = {
  idle: "",
  unsaved: "Unsaved changes...",
  saving: "Saving...",
  saved: "Saved",
  error: "Could not save, still trying",
};

function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      // Mousedown instead of click, prevented, so the editor never loses its
      // selection when a formatting button is pressed.
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className="grid h-8 w-8 place-items-center rounded-[var(--radius)] text-muted transition-colors hover:bg-surface-2 hover:text-text"
    >
      {children}
    </button>
  );
}

interface Props {
  title: string;
  // Optional: the cold-call scripts sit under a row that already names them, and
  // a line of explanatory text under a heading is not wanted there.
  subtitle?: string;
  // undefined until the stored document arrives; the editor seeds exactly once.
  html: string | undefined;
  isLoading: boolean;
  isError: boolean;
  // Rejecting marks the document dirty again so the next input, or the unmount
  // flush, retries. The editor never discards what is on screen.
  save: (html: string) => Promise<unknown>;
}

export default function ScriptEditor({ title, subtitle, html, isLoading, isError, save }: Props) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const seededRef = useRef(false);
  const dirtyRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  // save() is called from a mount-only unmount flush, so the latest one is held
  // in a ref: a stale closure there would post an old document.
  const saveRef = useRef(save);
  saveRef.current = save;
  const [status, setStatus] = useState<SaveStatus>("idle");

  // Seed the editor exactly once, when the stored doc first arrives.
  useEffect(() => {
    if (seededRef.current || html === undefined) return;
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = html;
    seededRef.current = true;
  }, [html]);

  const flush = () => {
    const el = editorRef.current;
    if (!el || !dirtyRef.current) return;
    dirtyRef.current = false;
    setStatus("saving");
    saveRef
      .current(el.innerHTML)
      .then(() => setStatus("saved"))
      .catch(() => {
        dirtyRef.current = true;
        setStatus("error");
      });
  };

  const scheduleSave = () => {
    dirtyRef.current = true;
    setStatus("unsaved");
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(flush, 800);
  };

  // Unmount flush: switching page must never drop typing.
  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      flush();
    };
    // Mount-only on purpose; flush reads refs, not state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exec = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    scheduleSave();
  };

  return (
    <div className="max-w-[880px]">
      <div className="rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-divider px-4 py-3">
          <div>
            <h2 className="font-display text-[15px] font-semibold text-text">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[12px] text-faint">{subtitle}</p>}
          </div>
          <span
            className={
              "text-[11.5px] font-semibold " +
              (status === "error"
                ? "text-danger"
                : status === "saved"
                  ? "text-positive"
                  : "text-faint")
            }
            aria-live="polite"
          >
            {STATUS_LABEL[status]}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-0.5 border-b border-divider px-2 py-1.5">
          <ToolButton label="Heading" onClick={() => exec("formatBlock", "<h1>")}>
            <Heading1 size={15} />
          </ToolButton>
          <ToolButton label="Subheading" onClick={() => exec("formatBlock", "<h2>")}>
            <Heading2 size={15} />
          </ToolButton>
          <ToolButton label="Normal text" onClick={() => exec("formatBlock", "<p>")}>
            <Pilcrow size={15} />
          </ToolButton>
          <span className="mx-1 h-5 w-px bg-divider" aria-hidden />
          <ToolButton label="Bold" onClick={() => exec("bold")}>
            <Bold size={15} />
          </ToolButton>
          <ToolButton label="Italic" onClick={() => exec("italic")}>
            <Italic size={15} />
          </ToolButton>
          <ToolButton label="Underline" onClick={() => exec("underline")}>
            <Underline size={15} />
          </ToolButton>
          <span className="mx-1 h-5 w-px bg-divider" aria-hidden />
          <ToolButton label="Bullet list" onClick={() => exec("insertUnorderedList")}>
            <List size={15} />
          </ToolButton>
          <ToolButton label="Numbered list" onClick={() => exec("insertOrderedList")}>
            <ListOrdered size={15} />
          </ToolButton>
          <span className="mx-1 h-5 w-px bg-divider" aria-hidden />
          <ToolButton label="Clear formatting" onClick={() => exec("removeFormat")}>
            <RemoveFormatting size={15} />
          </ToolButton>
        </div>

        {isLoading ? (
          <p className="px-5 py-8 text-[13px] text-muted">Loading script...</p>
        ) : isError ? (
          <p className="px-5 py-8 text-[13px] text-danger">
            Could not load the script. Reload to try again.
          </p>
        ) : (
          <div
            ref={editorRef}
            contentEditable
            role="textbox"
            aria-multiline="true"
            aria-label={title}
            spellCheck
            onInput={scheduleSave}
            data-placeholder="Write the dialing script here. Format it with the toolbar above, just like a doc."
            className="script-doc script-editor min-h-[420px] px-5 py-4 outline-none"
          />
        )}
      </div>
    </div>
  );
}
