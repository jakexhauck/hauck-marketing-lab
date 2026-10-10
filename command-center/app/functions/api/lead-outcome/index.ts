import { outcomeHandlers } from "../lib/outcomeHandlers";
import { LEAD_KEY_PURPOSE } from "../../lib/leadOutcome";

// /api/lead-outcome?l=..&c=..&k=..  (public, own key)
//
// The older Lead Outcome Link. Opens the universal outcome page (lib/outcome.ts)
// with its own key, so links already pasted into GHL keep working.

export const { onRequestGet, onRequestPost } = outcomeHandlers(LEAD_KEY_PURPOSE);
