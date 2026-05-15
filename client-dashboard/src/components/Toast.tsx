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
        className="pointer-events-auto max-w-sm rounded-full bg-slate-900/95 px-4 py-2 text-sm font-medium text-white shadow-lg active:opacity-80"
      >
        {message}
      </button>
    </div>
  );
}
