import { useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { useNotesQuery, useCreateNote, useDeleteNote } from "@/hooks/useApi";
import { formatDateTime } from "@/lib/format";
import { Button, Spinner, EmptyState } from "@/components/ui";
import { useToast } from "@/context/ToastContext";

// Self-contained notes panel: pass a contactId, it owns its own data + mutations.
// Reused by the lead drawer and the contact drawer.
export function NotesPanel({ contactId }: { contactId: string }) {
  const { data, isLoading } = useNotesQuery(contactId);
  const create = useCreateNote(contactId);
  const remove = useDeleteNote(contactId);
  const { toast } = useToast();
  const [draft, setDraft] = useState("");

  const notes = data?.notes ?? [];

  async function add() {
    const body = draft.trim();
    if (!body) return;
    try {
      await create.mutateAsync(body);
      setDraft("");
    } catch {
      toast("Couldn't save the note.", "error");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Add a note…"
          className="min-h-[40px] flex-1 resize-y rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 py-2 text-[13px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
        <Button variant="primary" size="icon" onClick={add} loading={create.isPending} disabled={!draft.trim()} aria-label="Add note">
          {!create.isPending && <Plus size={16} />}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : notes.length === 0 ? (
        <EmptyState title="No notes" description="Anything you jot here stays with the contact." className="py-8" />
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => (
            <li key={note.id} className="group rounded-[var(--radius-sm)] border border-border bg-surface-2/50 px-3 py-2.5">
              <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-text">{note.body}</p>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="font-data text-[11px] text-faint">
                  {note.dateAdded ? formatDateTime(note.dateAdded) : ""}
                </span>
                <button
                  onClick={() => remove.mutate(note.id)}
                  className="text-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                  aria-label="Delete note"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
