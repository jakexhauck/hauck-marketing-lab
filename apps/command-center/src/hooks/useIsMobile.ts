import { useEffect, useState } from "react";

// True below the admin console's mobile breakpoint (the same 1024px `lg` line
// the layout and the setter surfaces switch on). Used where the difference is
// structural (a different React tree, a forced view) rather than something a
// media query can express in CSS alone.
const MOBILE_QUERY = "(max-width: 1023.98px)";

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(MOBILE_QUERY).matches,
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}

export default useIsMobile;
