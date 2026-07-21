import { useState } from "react";
import { CheckSquare, X } from "lucide-react";
import { Button } from "../../ui/Button";
import { useCreateSetterTask } from "../../../hooks/useApi";
import { useToast } from "../../../context/ToastContext";

// Quick follow-up task prompt shown after the Follow Up cockpit action applies
// its tag. Title is required (prefilled with the lead's name); the due date is
// picked from three quick options, resolved to end-of-day local time. Writes to
// the client's own CRM through the tenant-scoped setter task endpoint.

interface Props {
  tenantId: string;
  contactId: string;
  leadName: string;
  onClose: () => void;
}

type Due = "today" | "tomorrow" | "week";

const DUE_LABELS: Record<Due, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  week: "Next week",
};

// End of the chosen day in the setter's local time, as an ISO string.
function dueDateFor(due: Due): string {
  const d = new Date();
  const add = due === "today" ? 0 : due === "tomorrow" ? 1 : 7;
  d.setDate(d.getDate() + add);
  d.setHours(23, 59, 0, 0);
  return d.toISOString();
}

export default function SetterTaskModal({ tenantId, contactId, leadName, onClose }: Props) {
  const { showToast } = useToast();
  const createTask = useCreateSetterTask();
  const [title, setTitle] = useState(`Follow up with ${leadName}`);
  const [due, setDue] = useState<Due>("tomorrow");

  const canSave = title.trim().length > 0 && !createTask.isPending;

  const save = () => {
    if (!canSave) return;
    createTask.mutate(
      { tenantId, contactId, title: title.trim(), dueDate: dueDateFor(due) },
      {
        onSuccess: () => {
          showToast("Follow-up task added");
          onClose();
        },
        onError: () => showToast("Could not add the task, please try again"),
      },
    );
  };

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
            <h2 className="font-display text-[16px] font-semibold text-text">Add a follow-up task</h2>
            <p className="mt-0.5 text-[12.5px] text-muted">Tagged for follow up. Set a reminder to circle back.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-muted transition-colors hover:bg-surface-3 hover:text-text"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-[22px] py-5">
          <label className="flex flex-col gap-1.5">
            <span className="label-cap text-faint">Task</span>
            <input
              value={title}
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
              className="w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[14px] text-text outline-none placeholder:text-faint focus:border-brand/50"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="label-cap text-faint">Due</span>
            <div className="flex gap-2">
              {(Object.keys(DUE_LABELS) as Due[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDue(d)}
                  aria-pressed={due === d}
                  className={
                    "flex-1 rounded-[var(--radius)] border px-3 py-2 text-[13px] font-medium transition-colors " +
                    (due === d
                      ? "border-brand bg-brand-tint text-brand-text"
                      : "border-border bg-surface text-muted hover:bg-surface-2")
                  }
                >
                  {DUE_LABELS[d]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-[22px] py-3.5">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={save} loading={createTask.isPending} disabled={!canSave}>
            Add task
          </Button>
        </div>
      </div>
    </div>
  );
}
