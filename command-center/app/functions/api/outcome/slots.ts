import { outcomeHandlers } from "../lib/outcomeHandlers";
import { OUTCOME_LINK_PURPOSE } from "../../lib/outcome";

// GET /api/outcome/slots?l=..&c=..&k=..&cal=estimate|job  (public, own key)
//   -> { days: [{ date, slots: [iso] }] }

export const onRequestGet = outcomeHandlers(OUTCOME_LINK_PURPOSE).onSlotsGet;
