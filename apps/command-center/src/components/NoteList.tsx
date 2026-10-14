import { useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import BrandedButton from "./BrandedButton";
import { timeAgo } from "../lib/timeAgo";
import { useNow } from "../context/NowContext";
import {
  useCreateNote,
  useDeleteNote,
  useNotesQuery,
  useUpdateNote,
} from "../hooks/useApi";

interface Props {
  contactId: string;
  onToast?: (message: string) => void;
}

const textareaClass =
  "min-h-[80px] w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--ring)]";

export default function NoteList({ contactId, onToast }: Props) {
  const now = useNow();
  const notesQuery = useNotesQuery(contactId, true);
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();

  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const notes = notesQuery.data?.notes ?? [];

  const handleCreate = () => {
    const body = draft.trim();
    if (!body) return;
    createNote.mutate(
      { contactId, body },
      {
        onSuccess: () => {
          setDraft("");
          onToast?.("Note added");
        },
        onError: () => onToast?.("Could not add note"),
      },
    );
  };

  const startEdit = (id: string, body: string) => {
    setEditingId(id);
    setEditDraft(body);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
  };

  const handleUpdate = (noteId: string) => {
    const body = editDraft.trim();
    if (!body) return;
    updateNote.mutate(
      { contactId, noteId, body },
      {
        onSuccess: () => {
          cancelEdit();
          onToast?.("Note updated");
        },
        onError: () => onToast?.("Could not update note"),
      },
    );
  };

  const handleDelete = (noteId: string) => {
    if (!window.confirm("Delete this note?")) return;
    deleteNote.mutate(
      { contactId, noteId },
      {
        onSuccess: () => onToast?.("Note deleted"),
        onError: () => onToast?.("Could not delete note"),
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add a quick note about this lead."
        className={textareaClass}
      />
      <BrandedButton
        variant="primary"
        onClick={handleCreate}
        disabled={draft.trim().length === 0 || createNote.isPending}
        className="self-start"
      >
        {createNote.isPending ? "Adding..." : "Add note"}
      </BrandedButton>

      {notesQuery.isLoading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading notes.</p>
      ) : notesQuery.isError ? (
        <p className="text-sm text-[var(--text-muted)]">
          Could not load notes.
        </p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No notes yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((n) => (
            <li
              key={n.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
            >
              {editingId === n.id ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    className={textareaClass}
                  />
                  <div className="flex items-center gap-2 self-end">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      aria-label="Cancel edit"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors active:scale-[0.96]"
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdate(n.id)}
                      disabled={
                        editDraft.trim().length === 0 || updateNote.isPending
                      }
                      aria-label="Save note"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--brand-text)] transition-colors active:scale-[0.96] disabled:opacity-40"
                    >
                      <Check size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="whitespace-pre-wrap break-words text-sm text-[var(--text)]">
                    {n.body}
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="label-cap text-[var(--text-faint)]">
                      {n.dateAdded ? timeAgo(n.dateAdded, now) : ""}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(n.id, n.body)}
                        aria-label="Edit note"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors active:scale-[0.96]"
                      >
                        <Pencil size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(n.id)}
                        disabled={deleteNote.isPending}
                        aria-label="Delete note"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors active:scale-[0.96] disabled:opacity-40"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
