import { outcomeHandlers } from "../lib/outcomeHandlers";
import { SETTER_OUTCOME_PURPOSE } from "../../lib/outcome";

// GET /api/setter-outcome/week?l=..&c=..&k=..&start=<ms>&end=<ms>&cal=estimate|job  (own key)
// The Setting booking wizard's week (lib/outcomeHandlers.ts onWeekGet).

export const onRequestGet = outcomeHandlers(SETTER_OUTCOME_PURPOSE).onWeekGet;
