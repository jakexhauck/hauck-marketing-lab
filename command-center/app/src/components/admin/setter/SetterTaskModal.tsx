import { useState } from "react";
import { CheckSquare, X } from "lucide-react";
import { Button } from "../../ui/Button";
import { useCreateSetterTask } from "../../../hooks/useApi";
import { useToast } from "../../../context/ToastContext";

// Follow-up task prompt shown after the Follow Up cockpit action applies its
// tag. Title is required (prefilled with the lead's name); the setter picks the
// exact follow-up date and time (quick presets fill the date; the time input
// sets the hour). Writes to the client's own CRM through the tenant-scoped
// setter task endpoint.

interface Props {
  tenantId: string;
  contactId: string;
  leadName: string;
  onClose: () => void;
}

// A local date "YYYY-MM-DD" this many days from today (native date-input value).
function localDateStr(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const PRESETS: { label: string; offset: number }[] = [
  { label: "Today", offset: 0 },
  { label: "Tomorrow", offset: 1 },
  { label: "Next week", offset: 7 },
];

export default function SetterTaskModal({ tenantId, contactId, leadName, onClose }: Props) {
  const { showToast } = useToast();
  const createTask = useCreateSetterTask();
  const [title, setTitle] = useState(`Follow up with ${leadName}`);
  const [date, setDate] = useState(() => localDateStr(1)); // tomorrow
  const [time, setTime] = useState("09:00");

  const canSave = title.trim().length > 0 && Boolean(date) && Boolean(time) && !createTask.isPending;

  const save = () => {
    if (!canSave) return;
    // Combine the local date + time into an absolute instant for the CRM.
    const dueDate = new Date(`${date}T${time}`).toISOString();
    createTask.mutate(
      { tenantId, contactId, title: title.trim(), dueDate },
      {
        onSuccess: () => {
          showToast("Follow-up task added");
          onClose();
        },
        onError: () => showToast("Could not add the task, please try again"),
      },
    );
  };

  const fieldCls =
    "w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[14px] text-text outline-none placeholder:text-faint focus:border-brand/50";

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
            <p className="mt-0.5 text-[12.5px] text-muted">Tagged for follow up. Set when to circle back.</p>
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
              className={fieldCls}
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="label-cap text-faint">When to follow up</span>
            <div className="flex gap-2">
              {PRESETS.map((p) => {
                const on = date === localDateStr(p.offset);
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setDate(localDateStr(p.offset))}
                    aria-pressed={on}
                    className={
                      "flex-1 rounded-[var(--radius)] border px-3 py-1.5 text-[12.5px] font-medium transition-colors " +
                      (on
                        ? "border-brand bg-brand-tint text-brand-text"
                        : "border-border bg-surface text-muted hover:bg-surface-2")
                    }
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-1 flex gap-2">
              <input
                type="date"
                value={date}
                min={localDateStr(0)}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Follow-up date"
                className={fieldCls + " flex-[1.4]"}
              />
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                aria-label="Follow-up time"
                className={fieldCls + " flex-1"}
              />
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
