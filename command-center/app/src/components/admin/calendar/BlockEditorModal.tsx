import { useState, type FormEvent } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "../../ui/Button";
import { WORK_BLOCK_CATEGORIES, validateBlockTimes } from "../../../lib/workBlocks";
import type { ApiWorkBlock } from "../../../lib/api";

const inputCls =
  "w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 text-[14px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in LOCAL time. Convert
// to/from an ISO string so the API always gets a real instant.
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToIso(local: string): string {
  return new Date(local).toISOString();
}

export interface BlockDraft {
  id?: string;
  title: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
  color: string;
}

// ApiWorkBlock is imported for type narrowing in consumers; re-exported to keep
// the import surface minimal in AdminCalendar.
export type { ApiWorkBlock };

export default function BlockEditorModal({
  draft,
  onClose,
  onSave,
  onDelete,
}: {
  draft: BlockDraft;
  onClose: () => void;
  onSave: (b: BlockDraft) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(draft.title);
  const [start, setStart] = useState(isoToLocalInput(draft.startsAt));
  const [end, setEnd] = useState(isoToLocalInput(draft.endsAt));
  const [color, setColor] = useState(draft.color);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setErr("Give the block a title.");
    const startIso = localInputToIso(start);
    const endIso = localInputToIso(end);
    const invalid = validateBlockTimes(startIso, endIso);
    if (invalid) return setErr(invalid);
    setBusy(true);
    setErr(null);
    try {
      await onSave({ id: draft.id, title: title.trim(), startsAt: startIso, endsAt: endIso, color });
      onClose();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not save.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-md rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-lg)]"
      >
        <h2 className="mb-4 font-display text-[16px] font-semibold text-text">
          {draft.id ? "Edit block" : "New work block"}
        </h2>

        <label className="mb-1 block text-[12.5px] font-medium text-muted">Title</label>
        <input className={`${inputCls} mb-3`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Deep work" autoFocus />

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[12.5px] font-medium text-muted">Start</label>
            <input type="datetime-local" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[12.5px] font-medium text-muted">End</label>
            <input type="datetime-local" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>

        <label className="mb-1 block text-[12.5px] font-medium text-muted">Category</label>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {WORK_BLOCK_CATEGORIES.map((c) => (
            <button
              type="button"
              key={c.key}
              onClick={() => setColor(c.key)}
              className={[
                "flex items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                color === c.key
                  ? "bg-[var(--text)] text-[var(--bg)]"
                  : "border border-border text-muted hover:text-text",
              ].join(" ")}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${c.dotClass}`} /> {c.label}
            </button>
          ))}
        </div>

        {err && <p className="mb-3 text-[13px] text-danger">{err}</p>}

        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" loading={busy}>Save</Button>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          {draft.id && onDelete && (
            <button
              type="button"
              onClick={async () => {
                setBusy(true);
                try {
                  await onDelete(draft.id as string);
                  onClose();
                } catch {
                  setBusy(false);
                }
              }}
              className="ml-auto flex h-9 w-9 items-center justify-center rounded-[var(--radius)] text-faint hover:bg-danger-tint hover:text-danger"
              aria-label="Delete block"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
