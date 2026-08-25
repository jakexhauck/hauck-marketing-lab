import { useEffect, useRef, useState } from "react";

// One editable cell in the prospect book.
//
// The book arrives from a bought list and is wrong in a dozen small ways: a
// company spelled two ways, a niche nobody filled in, a website with no domain.
// Correcting that has to cost one click and one tab, or it does not happen and
// the book stays wrong.
//
// So the cell IS the input. No pencil to click, no row to open, no save button:
// it reads as plain text until focused, and commits on blur. That is the same
// bargain the daily tracker's grid makes, and the same reason.
//
// Escape reverts and Enter commits, because a table you tab through needs both
// an undo that does not require knowing what was there before and a way to
// finish without reaching for the mouse.

export default function EditableCell({
  value: rawValue,
  onSave,
  placeholder = "·",
  align = "left",
  mono = false,
  ariaLabel,
}: {
  // Null accepted, and flattened once here rather than at each of the columns
  // that pass one: a lead's niche or city is null in the book when nobody has
  // filled it in, and an input handed null silently stops being controlled.
  value: string | null;
  // Called only when the value actually changed, so tabbing across a row does
  // not fire a write per column.
  onSave: (next: string) => void;
  placeholder?: string;
  align?: "left" | "right";
  mono?: boolean;
  ariaLabel: string;
}) {
  const value = rawValue ?? "";
  const [draft, setDraft] = useState(value);
  const dirtyRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Follow the row when it changes underneath us (another tab, a bulk set, the
  // refetch after a save), but never while this cell is being typed in: that
  // would yank half-typed text out from under somebody.
  useEffect(() => {
    if (!dirtyRef.current) setDraft(value);
  }, [value]);

  const commit = () => {
    dirtyRef.current = false;
    const next = draft.trim();
    if (next === value) {
      setDraft(value);
      return;
    }
    onSave(next);
  };

  return (
    <input
      ref={inputRef}
      value={draft}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => {
        dirtyRef.current = true;
        setDraft(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          inputRef.current?.blur();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          dirtyRef.current = false;
          setDraft(value);
          inputRef.current?.blur();
        }
        // The row beneath is a drag-to-select surface; a cursor key inside a
        // text field is not a gesture on it.
        e.stopPropagation();
      }}
      // Selecting rows is a pointer drag on the row; starting one from inside a
      // cell would fight with placing the caret.
      onPointerDown={(e) => e.stopPropagation()}
      className={[
        "w-full rounded-[6px] border border-transparent bg-transparent px-1.5 py-1",
        "text-[13px] text-text outline-none transition-colors",
        "hover:border-divider focus:border-brand focus:bg-surface",
        "placeholder:text-faint",
        align === "right" ? "text-right" : "",
        mono ? "font-mono text-[12.5px]" : "",
      ].join(" ")}
    />
  );
}
