import { outcomeHandlers } from "../lib/outcomeHandlers";
import { LEAD_KEY_PURPOSE } from "../../lib/leadOutcome";

// GET /api/lead-outcome/slots?l=..&c=..&k=..&cal=estimate|job  (public, own key)

export const onRequestGet = outcomeHandlers(LEAD_KEY_PURPOSE).onSlotsGet;
