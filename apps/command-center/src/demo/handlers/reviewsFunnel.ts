import type { DemoRoute } from "./index";
import { DEMO_REVIEW_FUNNEL } from "../../lib/reviewsFunnel";

// Auto-registered demo route for the Google Reviews Overview funnel. Serves the
// sample funnel so showroom/preview reads full without touching a real GHL
// pipeline. See reactivation.ts for the canonical example.
export const route: DemoRoute = {
  match: (clean) => clean === "/api/reviews/funnel",
  respond: () => DEMO_REVIEW_FUNNEL,
};
