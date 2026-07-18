import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Check } from "lucide-react";
import type { AdminLeadStatus } from "../../../lib/api";
import { LEAD_STATUSES, STATUS_META } from "../../../lib/adminLeads";

// The status picker that hangs off a LeadStatusPill. Ported from the .pop block
// in docs/mockups/admin-redesign/leads-B.html: a small fixed-position card
// listing all seven statuses with the current one checked.
//
// Fixed positioning (rather than a portal) keeps the markup inside the row, so
// the .pk-kit-scoped styles still reach it while the card's own overflow never
// clips it. The menu closes on outside pointerdown, scroll, resize or Escape,
// matching the mockup.

interface LeadStatusMenuProps {
  anchorRef: RefObject<HTMLElement | null>;
  current: AdminLeadStatus;
  onSelect: (status: AdminLeadStatus) => void;
  onClose: () => void;
}

export default function LeadStatusMenu({
  anchorRef,
  current,
  onSelect,
  onClose,
}: LeadStatusMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Measure once mounted so the menu can flip above the pill, or pull left,
  // when it would otherwise run off the viewport.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const menu = menuRef.current;
    if (!anchor || !menu) return;
    const a = anchor.getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    let top = a.bottom + 6;
    let left = a.left;
    if (left + m.width > window.innerWidth - 10) left = window.innerWidth - m.width - 10;
    if (top + m.height > window.innerHeight - 10) top = a.top - m.height - 6;
    setPos({ top: Math.max(10, top), left: Math.max(10, left) });
  }, [anchorRef]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    // Capture phase so a scroll inside the table card closes it too, not just
    // a window scroll.
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [anchorRef, onClose]);

  return (
    <div
      ref={menuRef}
      className="adl-pop"
      role="listbox"
      aria-label="Lead status"
      // Hidden until measured so it never flashes at the top-left corner.
      style={{
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      {LEAD_STATUSES.map((status) => {
        const meta = STATUS_META[status];
        const isCurrent = status === current;
        return (
          <button
            key={status}
            type="button"
            role="option"
            aria-selected={isCurrent}
            className={isCurrent ? "cur" : undefined}
            onClick={() => onSelect(status)}
          >
            <span className="adl-sw" style={{ background: meta.swatch }} aria-hidden />
            {meta.label}
            <span className="adl-chk" aria-hidden>
              <Check size={14} strokeWidth={3} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
