import { useMemo } from "react";
import { demoMode } from "../demo/demoMode";
import { buildEstimateForms } from "../lib/estimateForms";
import type { InboxDataset } from "../lib/leadInbox";

// The Estimate Forms surface reads its data through this hook so the page stays
// source-agnostic. Today it returns a hand-authored demo inbox in demo/preview
// mode and an empty set in a real session (no GoHighLevel forms feed yet). When
// the live source lands, swap the body for a query (e.g. `useQuery(["estimate-
// forms"], () => api("/api/forms/submissions"))`) and keep the return shape:
// nothing downstream changes.
export function useEstimateForms(): InboxDataset {
  const demo = demoMode();
  return useMemo(() => buildEstimateForms(demo), [demo]);
}
