import { CheckCircle2 } from "lucide-react";

interface Props {
  message: string;
  onDismiss: () => void;
}

export default function Toast({ message, onDismiss }: Props) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
      style={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
    >
      <button
        type="button"
        onClick={onDismiss}
        className="pointer-events-auto inline-flex max-w-sm items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-opacity active:opacity-80"
      >
        <CheckCircle2 size={16} className="text-emerald-400" aria-hidden="true" />
        <span>{message}</span>
      </button>
    </div>
  );
}
