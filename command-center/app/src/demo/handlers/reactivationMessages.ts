import type { DemoRoute } from "./index";
import { DEMO_REACTIVATION_MESSAGES } from "../../lib/reactivationMessages";

// Auto-registered demo route for Reactivation > Messages. Serves the sample
// win-back SMS + email so the preview reads full without touching a real
// account. See reactivation.ts for the canonical example.
export const route: DemoRoute = {
  match: (clean) => clean === "/api/reactivation/messages",
  respond: () => DEMO_REACTIVATION_MESSAGES,
};
