import { useRef, useState } from "react";
import { GripHorizontal, ScrollText, X } from "lucide-react";
import { useSetterScriptQuery } from "../../../hooks/useApi";

// The dialing script as a FLOATING PANEL, not a modal: no backdrop, nothing
// blocked, so the setter reads the script while working the cockpit (logging
// the call, tagging, booking) at the same time. Drag it by the header to
// park it wherever it is not in the way. Opens docked to the left, clear of
// the right-docked cockpit.
//
// dangerouslySetInnerHTML is safe HERE AND ONLY HERE because the html comes
// from /api/admin/setter/script, whose write path forces every document
// through the allowlist sanitizer in functions/lib/setterScript.ts. Nothing
// else may render this column.

interface Props {
  tenantId: string;
  clientName: string;
  onClose: () => void;
}

export default function SetterScriptOverlay({ tenantId, clientName, onClose }: Props) {
  const scriptQuery = useSetterScriptQuery(tenantId, true);
  const html = scriptQuery.data?.html ?? "";

  // Panel position, dragged by the header. Starts docked bottom-left-ish.
  const [pos, setPos] = useState(() => ({
    x: 16,
    y: Math.max(16, window.innerHeight * 0.12),
  }));
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const onDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only the header drags; its buttons still need to click.
    if ((e.target as HTMLElement).closest("button")) return;
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    // Keep the header reachable so the panel can always be dragged back.
    setPos({
      x: Math.min(Math.max(e.clientX - d.dx, -320), window.innerWidth - 80),
      y: Math.min(Math.max(e.clientY - d.dy, 0), window.innerHeight - 48),
    });
  };
  const onDragEnd = () => {
    dragRef.current = null;
  };

  return (
    <section
      role="dialog"
      aria-label="Dialing script"
      // resize: the browser's native corner handle (bottom-right). It writes
      // inline width/height as the user drags, which is exactly what we want;
      // the min/max classes bound it so it can neither vanish nor swallow
      // the viewport.
      style={{ left: pos.x, top: pos.y, resize: "both" }}
      className="fixed z-[60] flex h-[min(560px,80dvh)] max-h-[92dvh] min-h-[200px] w-[440px] min-w-[320px] max-w-[92vw] flex-col overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface shadow-[var(--shadow-lg)]"
    >
      <div
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        className="flex cursor-grab touch-none items-center gap-2.5 border-b border-border px-4 py-3 active:cursor-grabbing"
      >
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-brand/10 text-brand">
          <ScrollText size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[14px] font-semibold leading-tight text-text">
            Dialing script
          </h2>
          <p className="truncate text-[11.5px] text-muted">{clientName}</p>
        </div>
        <GripHorizontal size={15} className="shrink-0 text-faint" aria-hidden />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialing script"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-muted transition-colors hover:bg-surface-3 hover:text-text"
        >
          <X size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {scriptQuery.isLoading ? (
          <p className="text-[13px] text-muted">Loading script...</p>
        ) : scriptQuery.isError ? (
          <p className="text-[13px] text-danger">Could not load the script. Close and retry.</p>
        ) : html.trim() === "" ? (
          <p className="text-[13px] text-faint">
            No script yet. Write it in the Settings tab and it will show here.
          </p>
        ) : (
          <div className="script-doc" dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
    </section>
  );
}
