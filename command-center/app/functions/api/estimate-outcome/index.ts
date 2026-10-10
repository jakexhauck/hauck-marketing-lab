import { outcomeHandlers } from "../lib/outcomeHandlers";
import { OUTCOME_KEY_PURPOSE } from "../../lib/estimateOutcome";

// /api/estimate-outcome?l=..&c=..&k=..  (public, own key)
//
// The older Estimate Outcome Link. Opens the universal outcome page
// (lib/outcome.ts) with its own key, so links already pasted into GHL keep
// working.

export const { onRequestGet, onRequestPost } = outcomeHandlers(OUTCOME_KEY_PURPOSE);
