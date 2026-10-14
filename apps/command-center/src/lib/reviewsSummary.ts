// Client-side shape for the Google rating hero + recent-reviews teaser on the
// Reviews Overview, mirroring functions/api/reviews/summary.ts. In a real
// session the hook fetches this from the Google Places API (rating, count, up to
// 5 recent reviews); in a demo session api() short-circuits to
// DEMO_REVIEW_SUMMARY so the preview reads full without a live Places call. Same
// golden rule as the rest of the app: a real client only ever sees their own
// numbers.

export interface ReviewSummaryItem {
  id: string;
  author: string;
  initials: string;
  rating: number;
  body: string;
  when: string;
}

export interface ReviewSummaryData {
  // Overall Google rating (0 when unrated) and total public review count.
  average: number;
  total: number;
  recent: ReviewSummaryItem[];
  // Present when the place cannot be resolved (no key / no place_id / no Places
  // result); the hero then shows its honest not-connected state, never zeros.
  configError?: "not_connected";
}

// Willis-flavored preview: a steady, strong local-service reputation. Recent
// reviews echo the demo copy elsewhere on the page.
export const DEMO_REVIEW_SUMMARY: ReviewSummaryData = {
  average: 4.8,
  total: 132,
  recent: [
    {
      id: "demo-garcia",
      author: "The Garcias",
      initials: "TG",
      rating: 5,
      body: "Woke up to no hot water and they had a new heater in by lunch. Tidy, fair price, walked us through everything.",
      when: "2 days ago",
    },
    {
      id: "demo-mark",
      author: "Mark T.",
      initials: "MT",
      rating: 5,
      body: "AC tune-up before the heat hit. Honest about what needed doing and what could wait. No upsell games.",
      when: "4 days ago",
    },
    {
      id: "demo-janet",
      author: "Janet R.",
      initials: "JR",
      rating: 5,
      body: "Burst pipe under the sink at 9pm. They came out, stopped the flood, and saved the cabinets. Lifesavers.",
      when: "1 week ago",
    },
  ],
};
