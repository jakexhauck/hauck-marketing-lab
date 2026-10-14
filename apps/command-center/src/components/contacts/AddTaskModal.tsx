import { useState } from "react";
import { Calendar, Check, CheckSquare, X } from "lucide-react";
import { DateTimeModal } from "../DateTimeModal";
import { useCreateTask } from "../../hooks/useApi";

const dueFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

// Create a follow-up task on a contact. Title is required; a due time is
// optional and collected through the shared DateTimeModal (any instant is
// valid, so no calendar availability lookup is needed).
export default function AddTaskModal({
  contactId,
  onClose,
  onSaved,
}: {
  contactId: string;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [pickingDue, setPickingDue] = useState(false);
  const createTask = useCreateTask();

  const canSave = title.trim().length > 0 && !createTask.isPending;

  function save() {
    if (!canSave) return;
    createTask.mutate(
      { contactId, title: title.trim(), dueDate: dueDate ?? undefined },
      {
        onSuccess: () => {
          onSaved("Task added");
          onClose();
        },
        onError: () => onSaved("Could not add task"),
      },
    );
  }

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-[rgba(15,18,48,0.42)] p-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface shadow-[var(--shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-border px-[22px] pb-3.5 pt-5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-brand/10 text-brand">
            <CheckSquare size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[16.5px] font-semibold text-text">
              Add task
            </div>
            <div className="mt-0.5 text-[12.5px] text-muted">
              A follow-up on this contact
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-surface-2 text-muted"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-3.5 px-[22px] py-4">
          <label className="block">
            <span className="mb-1.5 block font-display text-[12.5px] font-semibold text-muted">
              What needs doing?
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Call back about the estimate"
              autoFocus
              className="w-full rounded-[10px] border border-border bg-[var(--bg)] px-3 py-2.5 text-[13px] text-text outline-none placeholder:text-faint focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </label>

          {dueDate ? (
            <div className="flex items-center justify-between gap-3 rounded-[10px] border border-border bg-surface-2 px-3 py-2.5">
              <span className="flex items-center gap-2 text-[13px] font-semibold text-text">
                <Calendar size={15} className="text-muted" />
                Due {dueFmt.format(new Date(dueDate))}
              </span>
              <button
                type="button"
                onClick={() => setDueDate(null)}
                className="text-[12px] font-semibold text-muted hover:text-text"
              >
                Clear
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPickingDue(true)}
              className="inline-flex items-center gap-2 self-start rounded-[10px] border border-border bg-surface px-3 py-2 text-[13px] font-semibold text-muted hover:border-brand/40 hover:text-text"
            >
              <Calendar size={15} /> Set due time (optional)
            </button>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-[22px] py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border border-border bg-surface px-3.5 py-2 font-display text-[13px] font-semibold text-text hover:border-brand/40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="inline-flex items-center gap-2 rounded-[10px] px-3.5 py-2 font-display text-[13px] font-semibold text-white shadow-[var(--shadow-brand)] disabled:opacity-50"
            style={{ backgroundImage: "var(--grad-brand)" }}
          >
            <Check size={15} /> {createTask.isPending ? "Adding..." : "Add task"}
          </button>
        </div>
      </div>

      {pickingDue && (
        <DateTimeModal
          title="Task due time"
          subtitle="When should this be done by?"
          confirmLabel="Set due time"
          onClose={() => setPickingDue(false)}
          onConfirm={(iso) => {
            setDueDate(iso);
            setPickingDue(false);
          }}
        />
      )}
    </div>
  );
}
