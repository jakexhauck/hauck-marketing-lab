import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { SalesMeeting } from "../../../lib/api";
import CallCockpit from "./CallCockpit";

// The call cockpit, over the top of everything.
//
// Sales Calls is the list; clicking a row on it opens the call in here. There
// used to be a tab for this and a picker on the front of it asking which
// meeting you were on, which was a question the click had already answered.
//
// Full bleed on a phone, inset a little on a desktop so the list is still
// visibly underneath: this is a call opened ON the page, not a different page.
//
// Portalled to <body> rather than rendered in place. The pillar page scrolls
// horizontally in places, and an ancestor with overflow-x turns a fixed child
// into a clipped one: the same trap that once rendered Paid Ads Results sliced
// in half. Nothing above this in the tree can crop it now.
export default function CallModal({
  meeting,
  onClose,
}: {
  meeting: SalesMeeting;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement | null>(null);

  // Escape closes, and the page underneath stops scrolling while it is open.
  //
  // Escape is safe here in a way it would not be on a form: the ticks and
  // answers are written to localStorage as they are typed, so closing mid-call
  // and reopening puts you back exactly where you were, timer included.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  // Focus moves into the call. Without it the keyboard is still on the row
  // behind, so the first Tab walks the list under the panel rather than the
  // script on top of it.
  useEffect(() => {
    panel.current?.focus();
  }, []);

  // No click-to-close on the backdrop. There is barely any backdrop to click,
  // and the one thing a stray click must never do is take a half-worked call
  // off the screen while somebody is talking.
  return createPortal(
    <div
      className="fixed inset-0 z-[80] bg-[rgba(10,14,13,0.55)] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Call with ${meeting.prospectName || "prospect"}`}
    >
      <div
        ref={panel}
        tabIndex={-1}
        className={[
          "absolute inset-0 flex flex-col overflow-hidden border-[var(--border)]",
          "bg-[var(--surface)] outline-none sm:inset-3 sm:rounded-2xl sm:border",
          "sm:shadow-[var(--shadow-lg)] lg:inset-5",
        ].join(" ")}
      >
        {/* A slim bar rather than a header: the prospect, the clock and the
            booking are on the cockpit's own header card an inch below, and
            saying the name twice would push the first question of the call
            further down the screen for nothing. */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--divider)] px-4 py-2.5 sm:px-6">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--brand)]">
            On call
          </span>
          <button
            type="button"
            onClick={onClose}
            className={[
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px]",
              "font-semibold leading-none text-muted transition-colors",
              "hover:bg-surface-2 hover:text-text",
            ].join(" ")}
          >
            <X size={14} aria-hidden />
            Close
          </button>
        </div>

        {/* The call itself, scrolling inside the panel. The page behind is
            frozen, so there is one scrollbar on screen and it belongs to the
            script. */}
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
          <CallCockpit meeting={meeting} onDone={onClose} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
