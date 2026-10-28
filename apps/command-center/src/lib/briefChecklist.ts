// The account checks under each Client Brief section (Brief v2, Jake, 2026-10-17).
//
// The tickable setup boxes that used to sit here moved to the client's
// Director (Jake, 2026-10-21; lib/clientTasks.ts): one checklist, not two.
// What stays are the Accounts checks (functions/lib/clientAccounts.ts): auto
// green/red rows that follow the live check, which nobody ticks.

import type { BriefSectionId } from "./agentWire";
import type { AccountCheckId } from "../../functions/lib/clientAccounts";

// Which section each Accounts check sits in, by what it is about. In the
// Accounts page's order, which is the order the boxes show.
export const ACCOUNT_CHECK_SECTION: Record<AccountCheckId, BriefSectionId> = {
  ghl: "ghl",
  texting: "ghl",
  "meta-ads": "ads",
  "meta-page": "ads",
  pipeline: "ghl",
  calendars: "ghl",
  timezone: "ghl",
  "owner-links": "ghl",
  "owner-phone": "ghl",
  login: "csm",
  push: "csm",
};

export function accountChecksFor(section: BriefSectionId): AccountCheckId[] {
  return (Object.keys(ACCOUNT_CHECK_SECTION) as AccountCheckId[]).filter((id) => ACCOUNT_CHECK_SECTION[id] === section);
}
