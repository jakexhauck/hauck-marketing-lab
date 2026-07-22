import { Check, PhoneCall } from "lucide-react";
import { useSetterCallbacksQuery, useCompleteSetterCallback } from "../../../hooks/useApi";
import { useToast } from "../../../context/ToastContext";
import type { ApiSetterCallback } from "../../../lib/api";

// Scheduled callbacks due, pinned above the board. Only callbacks that are
// overdue or due within the lookahead render here: a callback set for next
// week is future work, not a rail item, and showing it would train setters
// to ignore the rail. Renders nothing when nothing qualifies.
//
// Checking one off completes the mirror row AND the CRM task (see
// callbacks/complete.ts for the ordering rationale).

interface Props {
  tenantId: string;
}

const HOUR_MS = 60 * 60 * 1000;
const LOOKAHEAD_MS = 12 * HOUR_MS;

function dueLabel(dueMs: number, now: number): { text: string; overdue: boolean } {
  const diff = dueMs - now;
  if (diff <= 0) {
    const late = -diff;
    if (late < HOUR_MS) return { text: "due now", overdue: true };
    if (late < 24 * HOUR_MS) return { text: `${Math.floor(late / HOUR_MS)}h late`, overdue: true };
    return { text: `${Math.floor(late / (24 * HOUR_MS))}d late`, overdue: true };
  }
  return {
    text: new Date(dueMs).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    overdue: false,
  };
}

export default function SetterCallbacksRail({ tenantId }: Props) {
  const { showToast } = useToast();
  const callbacksQuery = useSetterCallbacksQuery(tenantId);
  const completeMutation = useCompleteSetterCallback();

  const now = Date.now();
  const due = (callbacksQuery.data?.callbacks ?? []).filter((cb) => {
    const t = new Date(cb.dueAt).getTime();
    return !Number.isNaN(t) && t <= now + LOOKAHEAD_MS;
  });
  if (due.length === 0) return null;

  const complete = (cb: ApiSetterCallback) => {
    if (completeMutation.isPending) return;
    completeMutation.mutate(
      { tenantId, id: cb.id },
      {
        onSuccess: (res) => {
          showToast(
            res.crmUpdated
              ? "Callback done, task cleared"
              : "Callback done (tick the task in the CRM by hand)",
          );
        },
        onError: () => showToast("Could not complete that callback, please try again"),
      },
    );
  };

  return (
    <div className="mb-3 rounded-xl border border-warning/30 bg-surface px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-warning">
          <PhoneCall size={12} aria-hidden />
          Callbacks due
        </span>
        {due.map((cb) => {
          const label = dueLabel(new Date(cb.dueAt).getTime(), now);
          return (
            <span
              key={cb.id}
              className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2 py-1 pl-2.5 pr-1"
              title={cb.title}
            >
              <span className="max-w-[160px] truncate text-[12px] font-semibold text-text">
                {cb.contactName || cb.title}
              </span>
              <span
                className={
                  "font-data text-[10.5px] font-semibold " +
                  (label.overdue ? "text-danger" : "text-muted")
                }
              >
                {label.text}
              </span>
              <button
                type="button"
                onClick={() => complete(cb)}
                disabled={completeMutation.isPending}
                aria-label={`Mark callback for ${cb.contactName || cb.title} done`}
                className="grid h-5 w-5 place-items-center rounded-full bg-surface-3 text-muted transition-colors hover:bg-positive-tint hover:text-positive disabled:opacity-50"
              >
                <Check size={12} aria-hidden />
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}
