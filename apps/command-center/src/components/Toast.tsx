import { CheckCircle2 } from "lucide-react";

export interface ToastAction {
  label: string;
  onAction: () => void;
}

interface Props {
  message: string;
  onDismiss: () => void;
  action?: ToastAction;
}

const pillCls =
  "pointer-events-auto inline-flex max-w-sm items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-lg dark:border dark:border-[var(--border)] dark:bg-[var(--surface-2)] dark:text-[var(--text)]";

export default function Toast({ message, onDismiss, action }: Props) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
      style={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
    >
      {action ? (
        // Two controls side by side, never nested: tapping the message dismisses,
        // the trailing button runs the action (undo a delete, etc).
        <div className={pillCls}>
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex items-center gap-2 transition-opacity active:opacity-80"
          >
            <CheckCircle2 size={16} className="text-emerald-400" aria-hidden="true" />
            <span>{message}</span>
          </button>
          <button
            type="button"
            onClick={action.onAction}
            className="-mr-1 ml-1 shrink-0 rounded-lg border-l border-white/20 pl-3 pr-1 text-emerald-300 transition-opacity active:opacity-80 dark:border-[var(--border)] dark:text-[var(--brand)]"
          >
            {action.label}
          </button>
        </div>
      ) : (
        <button type="button" onClick={onDismiss} className={`${pillCls} transition-opacity active:opacity-80`}>
          <CheckCircle2 size={16} className="text-emerald-400" aria-hidden="true" />
          <span>{message}</span>
        </button>
      )}
    </div>
  );
}
