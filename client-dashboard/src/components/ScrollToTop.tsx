import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// Forward navigation starts at the top of the new screen; back/forward (POP)
// leaves scroll alone so the browser's own position restoration works.
export default function ScrollToTop() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType !== "POP") {
      window.scrollTo(0, 0);
    }
  }, [pathname, navigationType]);

  return null;
}
