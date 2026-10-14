import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { APPS_ROUTE, needsBackToAll } from "../lib/nav";

// The phone's "back to All features" control, as a handler the two shared page
// headers (<PageHeader>, <PageBar>) can drop straight into their `onBack` slot.
//
// Returns undefined on every page that does not need one, so a header can pass
// the result through without asking where it is: the decision lives in
// needsBackToAll (nav.ts) next to the nav list it is derived from, and a page
// that later moves onto or off the bottom bar gains or loses its chevron on its
// own. That is the drift this replaces. Both headers hide the control at lg,
// where the sidebar is the way back and /apps does not exist.
export function useBackToAll(): (() => void) | undefined {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Declared unconditionally: the early return below decides whether the caller
  // gets it, but the hook itself must run on every render.
  const goToAll = useCallback(() => navigate(APPS_ROUTE), [navigate]);
  return needsBackToAll(pathname) ? goToAll : undefined;
}

export default useBackToAll;
