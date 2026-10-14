import { useState } from "react";
import { CheckSquare, StickyNote } from "lucide-react";
import CockpitSection from "./CockpitSection";
import SetterTaskModal from "./SetterTaskModal";
import { Button } from "../../ui/Button";
import { useSetterNotesQuery, useCreateSetterNote } from "../../../hooks/useApi";
import { useToast } from "../../../context/ToastContext";
import { useNow } from "../../../context/NowContext";
import { timeAgo } from "../../../lib/timeAgo";
import { toPlainText } from "../../../lib/plainText";

// Notes + task creation for the cockpit, rendered on EVERY stage (both the
// stage-driven dialing panels and the generic fallback): whatever the stage,
// a setter can always write down what they learned and schedule work.
//
// Notes live on the CRM contact record, so the client's own team sees them
// there too. Tasks reuse the Follow Up flow's modal (dated GHL task + the
// callbacks-rail mirror), just opened directly instead of after a tag.

interface Props {
  tenantId: string;
  contactId: string;
  leadName: string;
  // Phone sheet: collapse behind a disclosure row (see CockpitSection).
  fold?: boolean;
}

// Show this many notes before collapsing behind a count; a chatty contact
// record must not bury the dialing panel above it.
const VISIBLE_NOTES = 4;

export default function SetterNotesTasks({ tenantId, contactId, leadName, fold }: Props) {
  const now = useNow();
  const { showToast } = useToast();
  const notesQuery = useSetterNotesQuery(tenantId, contactId);
  const createNote = useCreateSetterNote();
  const [draft, setDraft] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);

  const notes = notesQuery.data?.notes ?? [];
  const visible = showAll ? notes : notes.slice(0, VISIBLE_NOTES);

  const canSave = draft.trim().length > 0 && !createNote.isPending;

  const save = () => {
    if (!canSave) return;
    createNote.mutate(
      { tenantId, contactId, body: draft.trim() },
      {
        onSuccess: () => {
          setDraft("");
          showToast("Note added to the contact");
        },
        onError: () => showToast("Could not save the note, please try again"),
      },
    );
  };

  return (
    <CockpitSection
      fold={fold}
      meta={fold && notes.length > 0 ? notes.length : undefined}
      title={
        <>
          <StickyNote size={fold ? 14 : 12} aria-hidden />
          Notes
        </>
      }
    >
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // Enter saves, Shift+Enter makes a newline: same muscle memory as
          // every chat box, and a note is usually one line anyway.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            save();
          }
        }}
        rows={2}
        placeholder={`Note about ${leadName}...`}
        className="w-full resize-none rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[13px] text-text outline-none placeholder:text-faint focus:border-brand/50"
      />
      <div className="mt-2 flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={save}
          loading={createNote.isPending}
          disabled={!canSave}
        >
          Add note
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setTaskOpen(true)}>
          <CheckSquare size={13} /> Add task
        </Button>
      </div>

      {notesQuery.isError ? (
        <p className="mt-3 text-[12px] text-danger">Could not load notes.</p>
      ) : notesQuery.isLoading ? (
        <p className="mt-3 text-[12px] text-muted">Loading notes...</p>
      ) : notes.length === 0 ? (
        <p className="mt-3 text-[12px] text-faint">No notes on this contact yet.</p>
      ) : (
        <>
          <ul className="mt-3 flex flex-col gap-2">
            {visible.map((n) => (
              <li key={n.id} className="rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2">
                {/* A note written by a form submission arrives as HTML. Shown
                    raw it was tag soup on screen ("<p style=...><strong>..."),
                    so it is flattened to the text it meant. */}
                <p className="whitespace-pre-wrap break-words text-[12.5px] text-text">
                  {toPlainText(n.body)}
                </p>
                {n.dateAdded && (
                  <p className="font-data mt-1 text-[10.5px] text-faint">{timeAgo(n.dateAdded, now)}</p>
                )}
              </li>
            ))}
          </ul>
          {notes.length > VISIBLE_NOTES && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-2 text-[11.5px] font-semibold text-brand-text hover:underline"
            >
              {showAll ? "Show fewer" : `Show all ${notes.length} notes`}
            </button>
          )}
        </>
      )}

      {taskOpen && (
        <SetterTaskModal
          tenantId={tenantId}
          contactId={contactId}
          leadName={leadName}
          onClose={() => setTaskOpen(false)}
        />
      )}
    </CockpitSection>
  );
}
