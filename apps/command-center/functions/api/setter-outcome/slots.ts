import { outcomeHandlers } from "../lib/outcomeHandlers";
import { SETTER_OUTCOME_PURPOSE } from "../../lib/outcome";

// GET /api/setter-outcome/slots?l=..&c=..&k=..&cal=estimate|job  (own key)
//   -> { days: [{ date, slots: [iso] }] }

export const onRequestGet = outcomeHandlers(SETTER_OUTCOME_PURPOSE).onSlotsGet;
