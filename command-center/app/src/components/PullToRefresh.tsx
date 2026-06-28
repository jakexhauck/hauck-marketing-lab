import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { haptic } from "../lib/haptics";

// Touch-driven pull-to-refresh for the list screens: installed PWAs have no
// address bar and therefore no other way to force a refetch. Overscrolling
// more than 70px at the top of the page invalidates the screen's queries.
// Pure listener + indicator; the page itself is never translated.
const THRESHOLD = 70;
const MAX_PULL = 120;

interface Props {
  // react-query keys to invalidate for this screen, e.g. [["leads"], ["summary"]].
  queryKeys: unknown[][];
}

export default function PullToRefresh({ queryKeys }: Props) {
  const queryClient = useQueryClient();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  // Tracks whether the pull has crossed the commit threshold so we fire a
  // single haptic tick at the moment it arms, not on every move event.
  const armedRef = useRef(false);
  // Keys live in a ref so the touch listeners bind once per mount instead of
  // re-subscribing every render (callers pass array literals).
  const keysRef = useRef(queryKeys);
  keysRef.current = queryKeys;

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      startY.current = window.scrollY <= 0 ? e.touches[0].clientY : null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      const delta = e.touches[0].clientY - startY.current;
      const next = delta > 0 && window.scrollY <= 0 ? Math.min(delta, MAX_PULL) : 0;
      // Fire a single tick the moment the gesture crosses into "release to
      // refresh" territory, giving the pull a tactile commit point.
      const armed = next >= THRESHOLD;
      if (armed && !armedRef.current) haptic(10);
      armedRef.current = armed;
      setPull(next);
    };
    const onTouchEnd = () => {
      if (startY.current === null) return;
      startY.current = null;
      armedRef.current = false;
      setPull((current) => {
        if (current >= THRESHOLD) {
          setRefreshing(true);
          void Promise.all(
            keysRef.current.map((key) =>
              queryClient.invalidateQueries({ queryKey: key }),
            ),
          ).finally(() => setRefreshing(false));
        }
        return 0;
      });
    };
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [queryClient]);

  const visible = refreshing || pull > 8;
  if (!visible) return null;

  const armed = pull >= THRESHOLD;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 z-40 flex flex-col items-center gap-1.5"
      style={{
        top: "calc(env(safe-area-inset-top) + 8px)",
        opacity: refreshing ? 1 : Math.min(pull / THRESHOLD, 1),
      }}
    >
      <span
        className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] shadow-md"
        style={{
          color: armed || refreshing ? "var(--brand-primary)" : "var(--text-muted)",
        }}
      >
        <RefreshCw
          size={16}
          className={refreshing ? "animate-spin" : undefined}
          style={
            refreshing
              ? undefined
              : { transform: `rotate(${(pull / MAX_PULL) * 360}deg)` }
          }
        />
      </span>
      {(armed || refreshing) && (
        <span
          className="text-[11px] font-semibold"
          style={{ color: "var(--brand-text)" }}
        >
          {refreshing ? "Refreshing..." : "Release to refresh"}
        </span>
      )}
    </div>
  );
}
