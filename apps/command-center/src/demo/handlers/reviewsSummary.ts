import type { DemoRoute } from "./index";
import { DEMO_REVIEW_SUMMARY } from "../../lib/reviewsSummary";

// Auto-registered demo route for the Google Reviews Overview rating hero. Serves
// the sample summary so showroom/preview reads full without a live Places call.
// See reviewsFunnel.ts for the canonical example.
export const route: DemoRoute = {
  match: (clean) => clean === "/api/reviews/summary",
  respond: () => DEMO_REVIEW_SUMMARY,
};
