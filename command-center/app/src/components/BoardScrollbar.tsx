import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";

// A visible, draggable slider that pans a horizontally-scrolling container (the
// pipeline board). The board can hold more stages than fit on screen, and the
// native scrollbar is hidden, so this gives an obvious grab handle to slide
// across to the stages that are off-screen. It mirrors the container's scroll
// position both ways: dragging the thumb scrolls the board, and scrolling the
// board (swipe, wheel, snap) moves the thumb. Renders nothing when everything
// already fits.
export default function BoardScrollbar({
  scrollRef,
  className,
}: {
  scrollRef: RefObject<HTMLElement | null>;
  className?: string;
}) {
  const [m, setM] = useState({ left: 0, scrollWidth: 0, clientWidth: 0 });
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startLeft: number } | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const sync = () =>
      setM({ left: el.scrollLeft, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", sync);
      ro.disconnect();
    };
  }, [scrollRef]);

  const overflow = m.scrollWidth - m.clientWidth;
  // Nothing off-screen: no slider needed.
  if (overflow <= 1) return null;

  // Thumb width tracks the visible fraction (with a floor so it stays grabbable
  // when there are many stages); its travel maps 1:1 to the board's scroll range.
  const thumbW = Math.max(m.clientWidth / m.scrollWidth, 0.1);
  const maxLeftFrac = 1 - thumbW;
  const leftFrac = overflow > 0 ? (m.left / overflow) * maxLeftFrac : 0;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = { startX: e.clientX, startLeft: scrollRef.current?.scrollLeft ?? 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    const track = trackRef.current;
    if (!drag.current || !el || !track) return;
    const usable = track.clientWidth * maxLeftFrac;
    if (usable <= 0) return;
    const dx = e.clientX - drag.current.startX;
    el.scrollLeft = drag.current.startLeft + (dx / usable) * overflow;
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  return (
    <div className={className ?? "px-5 pt-2 lg:px-6"}>
      <div ref={trackRef} className="relative h-2 rounded-full bg-[var(--surface-2)]">
        <div
          role="scrollbar"
          aria-orientation="horizontal"
          aria-label="Slide across pipeline stages"
          aria-valuemin={0}
          aria-valuemax={Math.round(overflow)}
          aria-valuenow={Math.round(m.left)}
          className="absolute top-0 h-2 cursor-grab touch-none rounded-full bg-[var(--brand-primary)]/50 transition-colors hover:bg-[var(--brand-primary)]/80 active:cursor-grabbing"
          style={{ width: `${thumbW * 100}%`, left: `${leftFrac * 100}%` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      </div>
    </div>
  );
}
