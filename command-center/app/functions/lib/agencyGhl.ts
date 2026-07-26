import type { Env } from "./env";
import type { GhlContext } from "./ghl";

// Hauck Marketing's OWN GoHighLevel account.
//
// Every other GHL path in this app is per client: the Setter Suite books into a
// client's calendar with that client's credentials. A cold caller booking a
// meeting for Jake is the opposite, and pointing it at a tenant's creds would
// put agency sales calls on a customer's calendar.
//
// So it has its own pair of secrets, agency-wide and not in the tenants table:
//
//   AGENCY_GHL_LOCATION_ID   the Hauck Marketing sub-account
//   AGENCY_GHL_TOKEN         a Private Integration token for it
//
// Absent, every agency booking route answers "not configured" rather than
// falling back to a client's account, which is the only safe direction to fail.

export class AgencyGhlError extends Error {
  code: "not_configured";
  constructor() {
    super("The agency GoHighLevel account is not connected.");
    this.code = "not_configured";
  }
}

export function getAgencyGhlContext(env: Env): GhlContext {
  const locationId = (env.AGENCY_GHL_LOCATION_ID ?? "").trim();
  const token = (env.AGENCY_GHL_TOKEN ?? "").trim();
  if (!locationId || !token) throw new AgencyGhlError();
  return { locationId, token };
}

export function isAgencyGhlConfigured(env: Env): boolean {
  return Boolean((env.AGENCY_GHL_LOCATION_ID ?? "").trim() && (env.AGENCY_GHL_TOKEN ?? "").trim());
}

// The agency's booking timezone. GHL's free-slot lookup needs one, and the
// account itself is set to New York; the env var lets that move without a
// deploy if the agency ever does.
export function agencyTimezone(env: Env): string {
  return (env.AGENCY_TIMEZONE ?? "").trim() || "America/New_York";
}
