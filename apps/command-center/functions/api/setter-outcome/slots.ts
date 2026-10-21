import { outcomeHandlers } from "../lib/outcomeHandlers";
import { SETTER_OUTCOME_PURPOSE } from "../../lib/outcome";

// GET /api/setter-outcome/slots?l=..&c=..&k=..&cal=estimate|job  (own key)
//   -> { days: [{ date, slots: [iso] }] }, minus the client's Google busy time

export const onRequestGet = outcomeHandlers(SETTER_OUTCOME_PURPOSE, { google: true }).onSlotsGet;
