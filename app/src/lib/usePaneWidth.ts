import { useEffect, useState, type RefObject } from "react";

export const COMPACT_THRESHOLD = 800;

export interface PaneSize {
  width: number;
  compact: boolean;
}

export function usePaneWidth(ref: RefObject<HTMLElement | null>): PaneSize {
  const [size, setSize] = useState<PaneSize>(() => {
    const fallback = typeof window !== "undefined" ? window.innerWidth : 1440;
    return { width: fallback, compact: fallback < COMPACT_THRESHOLD };
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.round(entry.contentRect.width);
      setSize((prev) =>
        prev.width === w ? prev : { width: w, compact: w < COMPACT_THRESHOLD },
      );
    });
    ro.observe(el);
    const initial = Math.round(el.getBoundingClientRect().width);
    setSize({ width: initial, compact: initial < COMPACT_THRESHOLD });
    return () => ro.disconnect();
  }, [ref]);

  return size;
}
