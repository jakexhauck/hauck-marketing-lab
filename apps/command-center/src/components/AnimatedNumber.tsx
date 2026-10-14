import { useEffect, useRef, useState } from "react";

interface AnimatedNumberProps {
  value: number;
  format?: (n: number) => string;
  durationMs?: number;
}

const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);

export default function AnimatedNumber({
  value,
  format,
  durationMs = 400,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState<number>(value);
  const prevRef = useRef<number>(value);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    if (from === to) {
      setDisplay(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      const eased = easeOutQuad(t);
      const current = from + (to - from) * eased;
      setDisplay(current);
      // Track the live displayed value every frame so a value change mid-flight
      // resumes from what is on screen now, not the value from two updates ago
      // (prevRef used to update only on completion, causing a visible jump).
      prevRef.current = current;
      if (t < 1) {
        raf = requestAnimationFrame(step);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  const rendered = format ? format(display) : String(Math.round(display));
  return <span>{rendered}</span>;
}
