import type { DemoRoute } from "./index";
import { DEMO_AUDIENCES_DATA } from "../../lib/campaignsAudiences";

// Demo route for the Audiences surface. Mirrors the reactivation handler: a
// demo session resolves /api/campaigns/audiences to the Willis-flavored preview
// so nothing touches a real contact list.
export const route: DemoRoute = {
  match: (clean) => clean === "/api/campaigns/audiences",
  respond: () => DEMO_AUDIENCES_DATA,
};
