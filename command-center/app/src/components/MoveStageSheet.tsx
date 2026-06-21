import { Check, X } from "lucide-react";

interface Stage {
  id: string;
  name: string;
}

interface Props {
  leadName: string;
  currentStageId: string;
  stages: Stage[];
  onClose: () => void;
  onPickStage: (stageId: string, stageName: string) => void;
  onWon?: () => void;
  onLost?: () => void;
}

// Bottom sheet listing the lead's own pipeline stages in GHL order. Tap a
// stage to move by id; optional Won/Lost shortcuts set opportunity status.
export default function MoveStageSheet({
  leadName,
  currentStageId,
  stages,
  onClose,
  onPickStage,
  onWon,
  onLost,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-[var(--surface)] p-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="min-w-0 truncate font-display text-lg font-bold text-[var(--text)]">
            Move {leadName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] active:scale-[0.96]"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-1">
          <span className="label-cap px-1 pb-1">Stage</span>
          {stages.map((s) => {
            const current = s.id === currentStageId;
            return (
              <button
                key={s.id}
                type="button"
                disabled={current}
                onClick={() => onPickStage(s.id, s.name)}
                className="flex items-center justify-between rounded-xl px-3 py-3 text-left text-sm font-semibold text-[var(--text)] transition-colors active:bg-[var(--surface-2)] disabled:opacity-50"
              >
                <span>{s.name}</span>
                {current && (
                  <Check
                    size={16}
                    aria-hidden="true"
                    className="text-[var(--brand-text)]"
                  />
                )}
              </button>
            );
          })}
        </div>

        {(onWon || onLost) && (
          <div className="mt-3 flex gap-2 border-t border-[var(--divider)] pt-3">
            {onWon && (
              <button
                type="button"
                onClick={onWon}
                className="flex-1 rounded-xl bg-emerald-600 py-3 text-[13px] font-bold uppercase tracking-wider text-white active:scale-[0.98]"
              >
                Mark Won
              </button>
            )}
            {onLost && (
              <button
                type="button"
                onClick={onLost}
                className="flex-1 rounded-xl border border-[var(--border)] py-3 text-[13px] font-bold uppercase tracking-wider text-[var(--text-muted)] active:scale-[0.98] active:bg-[var(--surface-2)]"
              >
                Mark Lost
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
