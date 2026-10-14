import { useEffect, useRef, useState } from "react";
import { Button } from "../../ui/Button";

// Two gates before a client comes off Onboarding (Jake, 2026-09-23): a plain
// "are you sure", then typing DELETE. The red button stays locked until the
// text matches exactly. Escape or a click outside cancels at either stage.

export default function DeleteDialog({
  name,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  name: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<1 | 2>(1);
  const [typed, setTyped] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const armed = typed === "DELETE";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (stage === 2) input.current?.focus();
  }, [stage]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        className="w-full max-w-[420px] rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-lg)]"
      >
        {stage === 1 ? (
          <>
            <h2 id="delete-title" className="font-display text-[17px] font-semibold text-text">
              Delete {name}?
            </h2>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" autoFocus onClick={() => setStage(2)}>
                Yes, delete
              </Button>
            </div>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (armed && !pending) onConfirm();
            }}
          >
            <h2 id="delete-title" className="font-display text-[17px] font-semibold text-text">
              Type DELETE to confirm
            </h2>
            <input
              ref={input}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-label="Type DELETE to confirm"
              className="mt-4 w-full rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2.5 font-mono text-[14px] tracking-[0.08em] text-text focus:border-danger focus:outline-none focus:ring-2 focus:ring-danger/25"
            />
            {error && <p className="mt-2 text-[12px] font-medium text-danger">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="danger" size="sm" disabled={!armed} loading={pending}>
                Delete
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
