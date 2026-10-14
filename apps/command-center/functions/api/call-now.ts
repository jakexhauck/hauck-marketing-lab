import { CALL_NOW_PURPOSE, CALL_NOW_TAG } from "../lib/callNow";
import { callLinkHandlers } from "../lib/callNowHandler";

// /api/call-now?l=<locationId>&c=<contactId>&k=<key>  (public, own key)
//
// The owner's "tap to call" link for a new lead. POST tags the lead `call now`
// so the sub-account's "New Lead Auto Call" workflow rings the owner and
// bridges the call. See lib/callNow.ts for why it is shaped this way.

export const { onRequestGet, onRequestPost } = callLinkHandlers({
  purpose: CALL_NOW_PURPOSE,
  tag: CALL_NOW_TAG,
  source: "call-now",
});
