import { outcomeHandlers } from "../lib/outcomeHandlers";
import { SETTER_OUTCOME_PURPOSE } from "../../lib/outcome";

// GET /api/setter-outcome/lead?l=..&c=..&k=..  (own key)
//   -> { name, phone, email, form, hasJobCalendar, timezone } for the booking wizard

export const onRequestGet = outcomeHandlers(SETTER_OUTCOME_PURPOSE).onLeadGet;
