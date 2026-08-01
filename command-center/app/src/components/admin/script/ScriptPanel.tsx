import { useRef, useState } from "react";

import { GripHorizontal, ScrollText, X } from "lucide-react";

// The dialing script as a FLOATING PANEL, not a modal: no backdrop, nothing
// blocked, so whoever is on the phone reads the script while working the page
// underneath (logging the call, booking, taking notes) at the same time. Drag it
// by the header to park it wherever it is not in the way, resize from the
// bottom-right corner.
//
// Shared by the Setter Suite (one script per client) and Cold Calling (one for
// the agency). The caller supplies the loaded html and the subtitle; everything
// about how the panel behaves is identical, which is the point.
//
// dangerouslySetInnerHTML is safe HERE because every script endpoint forces its
// document through the allowlist sanitizer in functions/lib/setterScript.ts
// before storing it. Nothing that has not been through that sanitizer may be
// passed to this component.

// Cold calling's extra: several script variations to choose between, and the
// objection handling read alongside them. Optional, so the Setter Suite passes
// none of it and behaves exactly as it always has.
export interface ScriptShelf {
  // The live dialing variations, in the owner's order.
  scripts: { id: string; name: string; html: string }[];
  // Which one the caller is working from. This is what gets recorded on every
  // dial, so it changes only when they say so.
  selectedId: string | null;
  onSelect: (id: string) => void;
  // The one objections document, rendered UNDER the script in the same scroll
  // rather than behind a button of its own.
  //
  // This replaced a second floating panel on the other side of the screen. Two
  // panels meant the answer to what was just said was one click and one glance
  // away at the exact moment neither is free, and it only ever held this one
  // document anyway. Under the script, it is already on screen.
  objections?: { name: string; html: string; empty: string } | null;
}

interface Props {
  html: string;
  // What this script belongs to: a client's name, or "Agency" for cold calling.
  subtitle: string;
  isLoading: boolean;
  isError: boolean;
  // Where an empty document points the reader, e.g. "Write it in Settings".
  emptyHint: string;
  onClose: () => void;
  shelf?: ScriptShelf;
  // Which side the panel opens on. Two of these can be up at once (the script
  // in one hand, the objections in the other), so they must not land on top of
  // each other. Dragging still moves either anywhere.
  dock?: "left" | "right";
  // Heading text. Defaults to the dialing script, since that is what this panel
  // was built for and what every existing caller passes.
  title?: string;
}

// 440px wide (the w-[440px] below) plus a 16px margin.
const PANEL_WIDTH = 440;
const DOCK_MARGIN = 16;

export default function ScriptPanel({
  html,
  subtitle,
  isLoading,
  isError,
  emptyHint,
  onClose,
  shelf,
  dock = "left",
  title = "Dialing script",
}: Props) {
  const selectedScript = shelf?.scripts.find((s) => s.id === shelf.selectedId) ?? null;

  // The shelf, when present, is the source of what to render; `html` remains the
  // Setter Suite's single document.
  const body = shelf ? (selectedScript?.html ?? "") : html;
  const objections = shelf?.objections ?? null;
  // Panel position, dragged by the header. Starts docked bottom-left-ish, clear
  // of anything docked to the right.
  const [pos, setPos] = useState(() => ({
    x:
      dock === "right"
        ? Math.max(DOCK_MARGIN, window.innerWidth - PANEL_WIDTH - DOCK_MARGIN)
        : DOCK_MARGIN,
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
      aria-label={title}
      // resize: the browser's native corner handle (bottom-right). It writes
      // inline width/height as the user drags, which is exactly what we want;
      // the min/max classes bound it so it can neither vanish nor swallow the
      // viewport.
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
            {title}
          </h2>
          <p className="truncate text-[11.5px] text-muted">{subtitle}</p>
        </div>
        <GripHorizontal size={15} className="shrink-0 text-faint" aria-hidden />
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title.toLowerCase()}`}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-muted transition-colors hover:bg-surface-3 hover:text-text"
        >
          <X size={14} />
        </button>
      </div>

      {shelf && (
        <div className="shrink-0 border-b border-divider px-4 py-2.5">
          {/* Which script is being dialed. Changing it changes what every
              outcome pressed from now on is recorded against, so it is a
              deliberate control and not a view toggle. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-[11px] font-semibold uppercase tracking-wider text-faint">
              Script
            </span>
            {shelf.scripts.length === 0 ? (
              <span className="text-[12px] text-faint">None written yet</span>
            ) : (
              shelf.scripts.map((s) => {
                const on = s.id === shelf.selectedId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => shelf.onSelect(s.id)}
                    className={[
                      "rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                      on
                        ? "border-brand bg-brand/10 text-brand"
                        : "border-border text-muted hover:text-text",
                    ].join(" ")}
                    aria-pressed={on}
                  >
                    {s.name}
                  </button>
                );
              })
            )}
          </div>

        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {isLoading ? (
          <p className="text-[13px] text-muted">Loading script...</p>
        ) : isError ? (
          <p className="text-[13px] text-danger">Could not load the script. Close and retry.</p>
        ) : (
          <>
            {body.trim() === "" ? (
              <p className="text-[13px] text-faint">{emptyHint}</p>
            ) : (
              <div className="script-doc" dangerouslySetInnerHTML={{ __html: body }} />
            )}

            {/* Objection handling, under the pitch and separated by a rule so it
                reads as a second document rather than as more script. Rendered
                even when the script above it is empty: a caller with no script
                still gets asked the same questions. */}
            {objections && (
              <section className="mt-6 border-t border-divider pt-4">
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
                  {objections.name}
                </h3>
                {objections.html.trim() === "" ? (
                  <p className="text-[13px] text-faint">{objections.empty}</p>
                ) : (
                  <div
                    className="script-doc"
                    dangerouslySetInnerHTML={{ __html: objections.html }}
                  />
                )}
              </section>
            )}
          </>
        )}
      </div>
    </section>
  );
}
