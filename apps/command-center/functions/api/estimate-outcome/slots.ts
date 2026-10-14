import { outcomeHandlers } from "../lib/outcomeHandlers";
import { OUTCOME_KEY_PURPOSE } from "../../lib/estimateOutcome";

// GET /api/estimate-outcome/slots?l=..&c=..&k=..&cal=estimate|job  (public, own key)

export const onRequestGet = outcomeHandlers(OUTCOME_KEY_PURPOSE).onSlotsGet;
