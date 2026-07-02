// Client-side shape for the Reactivation surface, mirroring
// functions/api/campaigns/reactivation.ts. In a real session the hook fetches
// this from GHL's Database Reactivation pipeline; in a demo session api()
// short-circuits to DEMO_REACTIVATION below so the preview reads full without
// touching a real pipeline. Same golden rule as the rest of the app: a real
// client only ever sees their own counts.

export interface ReactivationData {
  // Everyone the campaign has contacted so far.
  reached: number;
  replied: number;
  booked: number;
  noAnswer: number;
  notFit: number;
  recent: { name: string; sub: string; initials: string }[];
  configError?: string;
}

// Willis-flavored preview. reached === replied + booked + noAnswer + notFit so
// the "where they are now" bars read as a clean partition of everyone reached.
export const DEMO_REACTIVATION: ReactivationData = {
  reached: 412,
  replied: 58,
  booked: 12,
  noAnswer: 286,
  notFit: 56,
  recent: [
    { name: "The Hendersons", sub: "Estimate booked · Jun 24", initials: "TH" },
    { name: "Carl Dunn", sub: "Estimate booked · Jun 19", initials: "CD" },
    { name: "The Okafors", sub: "Estimate booked · Jun 14", initials: "TO" },
  ],
};
