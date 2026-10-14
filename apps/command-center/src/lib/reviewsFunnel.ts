// Client-side shape for the Google Reviews funnel, mirroring
// functions/api/reviews/funnel.ts. In a real session the hook fetches this from
// GHL's Google Reviews pipeline (resolved by name); in a demo session api()
// short-circuits to DEMO_REVIEW_FUNNEL below so the preview reads full without
// touching a real pipeline. Same golden rule as the rest of the app: a real
// client only ever sees their own counts.

export interface ReviewFunnelData {
  // Everyone the review campaign has asked (all opportunities in the pipeline).
  asked: number;
  // Cumulative: asked customers who clicked the review link (clicked + both
  // outcomes), so the funnel always reads asked >= clicked >= positive.
  clicked: number;
  // Left a public positive review (the win).
  positive: number;
  // Routed to private feedback instead of a public review (caught before it
  // ever hit Google).
  negative: number;
  // Asked but has not clicked the link yet.
  pending: number;
  // A few most-recent positive submissions, newest first.
  recent: { name: string; sub: string; initials: string }[];
  // Present when the pipeline could not be resolved for the tenant; the surface
  // then shows its honest not-connected state instead of zeros-as-data.
  configError?: string;
}

// Willis-flavored preview. clicked >= positive + negative and pending ===
// asked - clicked so the funnel reads as a clean partition.
export const DEMO_REVIEW_FUNNEL: ReviewFunnelData = {
  asked: 128,
  clicked: 74,
  positive: 41,
  negative: 6,
  pending: 54,
  recent: [
    { name: "The Garcias", sub: "5 stars on Google · Jun 27", initials: "TG" },
    { name: "Mark Torres", sub: "5 stars on Google · Jun 25", initials: "MT" },
    { name: "The Reyes Family", sub: "5 stars on Google · Jun 14", initials: "TR" },
  ],
};
