import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { X } from "lucide-react";
import { useTour } from "../../context/TourContext";

// Spotlight padding around the target, and gap between spotlight and card.
const PAD = 6;
const GAP = 12;
const CARD_W = 320;
// How long to wait for a target element to appear before giving up and showing
// a centered card with no spotlight (slow route, hidden element, or a surface
// with no nav chrome on this layout).
const RESOLVE_TIMEOUT_MS = 2000;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function isDesktop(): boolean {
  return window.matchMedia("(min-width: 1024px)").matches;
}

// Where to place the card given the spotlight rect and viewport. Picks the side
// with the most room so it works for a left sidebar item and a bottom-bar item
// alike, then clamps fully on-screen.
function placeCard(rect: Rect): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardH = 200; // generous estimate; clamping handles the rest
  const spaceRight = vw - (rect.left + rect.width);
  const spaceLeft = rect.left;
  const spaceBelow = vh - (rect.top + rect.height);

  let top: number;
  let left: number;
  if (spaceRight >= CARD_W + GAP) {
    left = rect.left + rect.width + GAP;
    top = rect.top;
  } else if (spaceLeft >= CARD_W + GAP) {
    left = rect.left - CARD_W - GAP;
    top = rect.top;
  } else if (spaceBelow >= cardH + GAP) {
    left = rect.left;
    top = rect.top + rect.height + GAP;
  } else {
    // Above the target (typical for a bottom nav bar).
    left = rect.left;
    top = rect.top - cardH - GAP;
  }
  // Clamp on-screen with an 8px margin.
  left = Math.min(Math.max(8, left), vw - CARD_W - 8);
  top = Math.min(Math.max(8, top), vh - cardH - 8);
  return { top, left };
}

export default function TourOverlay() {
  const { active, step, index, steps, next, back, skip } = useTour();
  const navigate = useNavigate();
  const location = useLocation();
  const [rect, setRect] = useState<Rect | null>(null);
  // null target / timed out: centered card, no spotlight.
  const [resolved, setResolved] = useState(false);
  const stepKey = step?.id ?? null;

  // Navigate to the step's route so its surface is visible behind the dim.
  useEffect(() => {
    if (!active || !step) return;
    if (step.route && location.pathname !== step.route) {
      navigate(step.route);
    }
    // location intentionally omitted: we only navigate on step change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepKey]);

  // Resolve the target element for the current layout, then track it. Polls via
  // rAF (the route may still be settling) and gives up after the timeout.
  useEffect(() => {
    if (!active || !step) return;
    setResolved(false);
    setRect(null);

    const selector = isDesktop() ? step.target.desktop : step.target.mobile;
    if (!selector) {
      setResolved(true); // centered card by design
      return;
    }

    let raf = 0;
    let stop = false;
    const start = performance.now();

    const measure = (el: Element) => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    const tick = () => {
      if (stop) return;
      const el = document.querySelector(selector);
      if (el) {
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
        measure(el);
        setResolved(true);
        return;
      }
      if (performance.now() - start > RESOLVE_TIMEOUT_MS) {
        setResolved(true); // give up: centered card
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      stop = true;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepKey]);

  // Keep the spotlight pinned to the target through scroll / resize.
  useLayoutEffect(() => {
    if (!active || !step) return;
    const selector = isDesktop() ? step.target.desktop : step.target.mobile;
    if (!selector) return;
    const reposition = () => {
      const el = document.querySelector(selector);
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepKey]);

  // Esc skips the tour; arrow keys advance.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") skip();
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, skip, next, back]);

  if (!active || !step) return null;

  const useSpotlight = resolved && rect !== null;
  const cardPos = useSpotlight ? placeCard(rect) : null;
  const isLast = index === steps.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={step.title}>
      {/* Backdrop. When no spotlight, a flat dim; the box-shadow trick dims
          around the spotlight otherwise. Click-catcher blocks the app beneath. */}
      {!useSpotlight && <div className="absolute inset-0 bg-black/60" />}
      {useSpotlight && rect && (
        <div
          className="pointer-events-none absolute rounded-[10px] transition-all duration-200"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
            outline: "2px solid var(--brand-primary)",
            outlineOffset: "2px",
          }}
        />
      )}

      {/* The card. */}
      <div
        className="absolute w-[320px] max-w-[calc(100vw-16px)] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl transition-all duration-200"
        style={
          cardPos
            ? { top: cardPos.top, left: cardPos.left }
            : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }
        }
        aria-live="polite"
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
            Step {index + 1} of {steps.length}
          </span>
          <button
            type="button"
            onClick={skip}
            className="rounded-md p-1 text-[var(--text-faint)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            aria-label="Skip tour"
          >
            <X size={15} />
          </button>
        </div>

        <h3 className="font-display text-[16px] font-semibold leading-tight text-[var(--text)]">
          {step.title}
        </h3>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--text-muted)]">
          {step.body}
        </p>

        {/* Progress dots */}
        <div className="mt-3 flex items-center gap-1">
          {steps.map((s, i) => (
            <span
              key={s.id}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i === index ? 16 : 6,
                background:
                  i === index ? "var(--brand-primary)" : "var(--border)",
              }}
            />
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={skip}
            className="text-[12.5px] font-medium text-[var(--text-faint)] hover:text-[var(--text)]"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={back}
                className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="rounded-lg px-3.5 py-1.5 text-[13px] font-semibold"
              style={{ background: "var(--brand-primary)", color: "var(--brand-fg)" }}
            >
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
