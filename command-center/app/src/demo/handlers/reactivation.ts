import type { DemoRoute } from "./index";
import { DEMO_REACTIVATION } from "../../lib/reactivation";

// Canonical example of an auto-registered demo route. A feature build adds one
// file like this under src/demo/handlers/ and its demo endpoint is live with no
// edit to handler.ts. Keep demo DATA in your feature's own lib (here
// src/lib/reactivation.ts), not in src/demo/data.ts, so nothing collides.
export const route: DemoRoute = {
  match: (clean) => clean === "/api/campaigns/reactivation",
  respond: () => DEMO_REACTIVATION,
};
