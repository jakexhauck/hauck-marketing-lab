import { outcomeHandlers } from "../lib/outcomeHandlers";
import { OUTCOME_LINK_PURPOSE } from "../../lib/outcome";

// /api/outcome?l=<locationId>&c=<contactId>&k=<key>  (public, own key)
//
// The universal owner outcome page (lib/outcome.ts), behind the Outcome Link
// custom value.

export const { onRequestGet, onRequestPost } = outcomeHandlers(OUTCOME_LINK_PURPOSE);
