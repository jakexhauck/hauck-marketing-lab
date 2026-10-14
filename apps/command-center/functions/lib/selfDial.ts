// A client who rings their own leads ("self-dial"). One admin switch, two
// tenant columns: manual_lead_status (0102) lets the owner type what happened
// on each lead, and inbox_show_ad_leads (0104) stops their Inbox hiding the ad
// leads they are calling. Willis had both turned on by hand; a client who dials
// their own leads with only one of them is half set up, so they move together.
//
// Two controls set it: the "Client dials own leads" switch on the client sheet,
// and "Who dials" in the Software setup pop-up (onboarding_dialer, 0131). Both
// write all three columns through selfDialPatch, so they can never disagree.

export function parseSelfDialBody(body: unknown): { on: boolean } | { error: string } {
  const on = (body as { on?: unknown } | null)?.on;
  // Strictly a boolean: the string "false" is truthy, and coercing it would
  // switch the client ON.
  if (typeof on !== "boolean") return { error: "on must be true or false" };
  return { on };
}

export function selfDialPatch(on: boolean) {
  return {
    manual_lead_status: on,
    inbox_show_ad_leads: on,
    onboarding_dialer: on ? "client" : "agency",
  };
}
