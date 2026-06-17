import { useEffect, useRef } from "react";

interface Props {
  open: boolean;
  /** Name of the thing being deleted — shown inline in the prompt. */
  itemLabel: string;
  /** Noun for the prompt — "habit", "task", etc. */
  itemKind?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDeleteModal({
  open,
  itemLabel,
  itemKind = "item",
  onConfirm,
  onCancel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // Focus the safe (No) button by default so Enter doesn't nuke the row.
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const label = itemLabel.trim() || `this ${itemKind}`;

  return (
    <div
      className="md-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <style>{confirmCSS}</style>
      <div className="md-modal-card md-confirm-card" role="alertdialog" aria-modal="true">
        <div className="md-modal-title">Are you sure?</div>
        <p className="md-confirm-body">
          Are you sure you would like to delete <span className="md-confirm-name">{label}</span>?
          This can't be undone.
        </p>
        <div className="md-confirm-actions">
          <button
            ref={cancelRef}
            type="button"
            className="hml-btn md-confirm-no"
            onClick={onCancel}
          >
            No
          </button>
          <button
            type="button"
            className="hml-btn md-confirm-yes"
            onClick={onConfirm}
          >
            Yes, delete
          </button>
        </div>
      </div>
    </div>
  );
}

const confirmCSS = `
.md-confirm-card {
  max-width: 420px;
  text-align: left;
}
.md-confirm-body {
  margin: 6px 0 18px;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--hml-text-mid, var(--c-muted));
}
.md-confirm-name {
  color: var(--hml-text, var(--c-text));
  font-weight: 600;
}
.md-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}
.md-confirm-no {
  background: transparent !important;
  border: 1px solid var(--hml-border, rgba(var(--ink),0.14)) !important;
  color: var(--hml-text, var(--c-text)) !important;
}
.md-confirm-no:hover {
  background: var(--hml-row-hover, rgba(var(--ink),0.05)) !important;
}
.md-confirm-yes {
  background: var(--hml-red, var(--danger)) !important;
  border-color: var(--hml-red, var(--danger)) !important;
  color: #fff !important;
}
.md-confirm-yes:hover {
  background: color-mix(in srgb, var(--danger) 85%, #000) !important;
  border-color: color-mix(in srgb, var(--danger) 85%, #000) !important;
}
`;
