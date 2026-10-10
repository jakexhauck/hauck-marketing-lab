import { PHONE_APPT_CALL_PURPOSE, PHONE_APPT_CALL_TAG } from "../lib/callNow";
import { callLinkHandlers } from "../lib/callNowHandler";

// /api/phone-appt-call?l=<locationId>&c=<contactId>&k=<key>  (public, own key)
//
// The owner's "tap to call" link for a lead with a phone appointment. Same as
// /api/call-now, but its own key and its own tag (`phone appt call now`), so
// the sub-account's phone appointment workflow is the one that rings.

export const { onRequestGet, onRequestPost } = callLinkHandlers({
  purpose: PHONE_APPT_CALL_PURPOSE,
  tag: PHONE_APPT_CALL_TAG,
  source: "phone-appt-call",
});
