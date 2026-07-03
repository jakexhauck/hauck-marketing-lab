// Client-side shape for the Audiences surface, mirroring
// functions/api/campaigns/audiences.ts. In a real session the hook fetches the
// live segment counts from the client's GHL contacts; in a demo session api()
// short-circuits to DEMO_AUDIENCES_DATA below so the preview reads full without
// touching a real contact list. Same golden rule as the rest of the app: a real
// client only ever sees their own numbers.

export interface AudienceSegment {
  id: string;
  name: string;
  count: number;
  desc: string;
}

export interface AudiencesData {
  segments: AudienceSegment[];
  configError?: "not_connected";
}

// Willis-flavored preview. Richer than the live payload on purpose: the demo
// shows all six segments (including the two trade-specific ones the live
// endpoint omits) so the preview reads like a mature account.
export const DEMO_AUDIENCES_DATA: AudiencesData = {
  segments: [
    { id: "all", name: "All customers", count: 1420, desc: "Everyone in your customer list with a phone or email on file." },
    { id: "past", name: "Past customers", count: 640, desc: "No booked job in the last 12 months. Ripe for a win-back." },
    { id: "vip", name: "Repeat / VIP", count: 212, desc: "Booked 3+ jobs. Your most loyal customers." },
    { id: "new", name: "New customers", count: 96, desc: "First added in the last 60 days." },
    { id: "fivestar", name: "Recent 5-star jobs", count: 28, desc: "Left a 5-star review or rated the job highly. Great for referrals." },
    { id: "noac", name: "No A/C service in 12mo", count: 980, desc: "Due for a tune-up before the summer heat." },
  ],
};
