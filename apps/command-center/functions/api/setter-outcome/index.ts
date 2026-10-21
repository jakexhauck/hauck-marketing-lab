import { outcomeHandlers } from "../lib/outcomeHandlers";
import { SETTER_OUTCOME_PURPOSE } from "../../lib/outcome";
import { startAppCall } from "../../lib/appCall";

// /api/setter-outcome?l=<locationId>&c=<contactId>&k=<key>  (own key)
//
// The universal outcome page inside Client > Setting. Same answers, booking and
// moves as the Outcome Link; its Call button runs App Call instead of call now,
// and its open times skip the client's Google Calendar.

export const { onRequestGet, onRequestPost } = outcomeHandlers(SETTER_OUTCOME_PURPOSE, { call: startAppCall, google: true });
