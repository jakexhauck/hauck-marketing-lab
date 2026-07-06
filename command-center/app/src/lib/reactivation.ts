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

// The four "where they are now" buckets, in journey order (the win first), with
// their theme-aware bar fills. Shared by the Overview summary, the read-only
// Pipeline view, and the Full Data breakdown so all three stay in lockstep.
// Counts come from the live feed; only the color is presentation.
export type ReactBucketKey = "booked" | "replied" | "noAnswer" | "notFit";

export interface ReactStageRow {
  key: ReactBucketKey;
  label: string;
  hint: string;
  bar: string;
  grad?: boolean;
}

export const REACT_STAGE_ROWS: ReactStageRow[] = [
  { key: "booked", label: "Estimate booked", hint: "Won back, an estimate is scheduled", bar: "var(--positive)" },
  { key: "replied", label: "Replied", hint: "Texted or emailed us back", bar: "var(--grad-brand)", grad: true },
  { key: "noAnswer", label: "No answer yet", hint: "Reached, no reply yet", bar: "var(--surface-3)" },
  { key: "notFit", label: "Not a fit", hint: "Not qualified or asked us to stop", bar: "var(--text-faint)" },
];

// True once the campaign has actually reached anyone. Everywhere in the section
// this gates the designed layout vs the honest not-connected / empty state
// (never zeros-as-data).
export function reactPopulated(data: ReactivationData | undefined): boolean {
  return Boolean(data && data.reached > 0);
}

// Whole-number percentages of everyone reached, used by the Overview summary and
// the Full Data page. Returns 0 across the board before anyone is reached.
export interface ReactRates {
  replyRate: number;
  bookedRate: number;
  noAnswerRate: number;
}
export function reactRates(data: ReactivationData | undefined): ReactRates {
  const reached = data?.reached ?? 0;
  if (reached <= 0) return { replyRate: 0, bookedRate: 0, noAnswerRate: 0 };
  const pct = (n: number) => Math.round((n / reached) * 100);
  return {
    replyRate: pct(data?.replied ?? 0),
    bookedRate: pct(data?.booked ?? 0),
    noAnswerRate: pct(data?.noAnswer ?? 0),
  };
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
