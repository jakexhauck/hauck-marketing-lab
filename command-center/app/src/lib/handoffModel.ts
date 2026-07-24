import type { ApiHandoff, HandoffStatus, HandoffLostReason } from "./api";

// Pure helpers for the Handoffs lifecycle: status display, owner-accountability
// (response time + "ignored" detection), lost-reason labels, and the funnel
// rollup the scoreboard shows. No React, no side effects, so it unit-tests
// cleanly and both the phone and desktop surfaces read the same truth.

export type Tone = "neutral" | "amber" | "brand" | "violet" | "emerald" | "danger";

export const STATUS_META: Record<HandoffStatus, { label: string; tone: Tone }> = {
  new: { label: "Handed off", tone: "amber" },
  estimate_set: { label: "Estimate booked", tone: "violet" },
  job_booked: { label: "Job booked", tone: "brand" },
  won: { label: "Won", tone: "emerald" },
  lost: { label: "Lost", tone: "neutral" },
  later: { label: "Follow up", tone: "amber" },
};

// Safe lookup: a lead rehydrated from an older persisted cache can carry a
// status this build no longer knows. Fall back to the Handed Off look rather
// than crash the whole render (the query refetch replaces it moments later).
export function statusMeta(status: HandoffStatus): { label: string; tone: Tone } {
  return STATUS_META[status] ?? STATUS_META.new;
}

// The GHL tag each outcome drops on the lead. A GHL automation listens for the
// tag and moves the lead / fires the sequence.
//   - "new" (Handed Off) is set by the setter at hand-off.
//   - Estimate/Job Booked add NO tag from the app: booking the appointment on
//     the calendar is what moves the stage + tags the lead (GHL automation).
//   - Won / Lost / Follow Up tag directly from the button.
export const OUTCOME_TAG: Record<HandoffStatus, string | null> = {
  new: "lead hand off",
  estimate_set: null,
  job_booked: null,
  won: "owner won",
  lost: "owner lost",
  later: "owner follow up",
};

export const LOST_REASONS: { key: HandoffLostReason; label: string }[] = [
  { key: "price", label: "Price" },
  { key: "timing", label: "Timing" },
  { key: "competitor", label: "Competitor" },
  { key: "ghosted", label: "Ghosted" },
  { key: "diy", label: "DIY" },
  { key: "other", label: "Other" },
];

export function lostReasonLabel(reason: HandoffLostReason | null): string {
  if (!reason) return "";
  return LOST_REASONS.find((r) => r.key === reason)?.label ?? "Other";
}

// Won and Lost are terminal; everything else is still in play.
export function isClosed(status: HandoffStatus): boolean {
  return status === "won" || status === "lost";
}

export function isActive(status: HandoffStatus): boolean {
  return !isClosed(status);
}

export function minutesSince(iso: string, now: number): number {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.round((now - then) / 60_000));
}

// The owner has this long to reply before a fresh handoff flags as ignored.
export const IGNORE_THRESHOLD_MIN = 15;

// A handoff the owner has left sitting: still "new" (no reply) past the window.
// This is the accountability flag, the "owner dropped the lead" signal.
export function isIgnored(h: ApiHandoff, now: number): boolean {
  return h.status === "new" && minutesSince(h.handedAt, now) >= IGNORE_THRESHOLD_MIN;
}

// Minutes from handoff to the owner's first reply, or null if they never have.
export function responseMinutes(h: ApiHandoff): number | null {
  if (!h.firstOwnerReplyAt) return null;
  const start = new Date(h.handedAt).getTime();
  const reply = new Date(h.firstOwnerReplyAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(reply)) return null;
  return Math.max(0, Math.round((reply - start) / 60_000));
}

// A short, human duration for a minutes count ("4m", "2h", "1d").
export function shortDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

// A lead that reached an estimate or beyond, for the "estimated" funnel count.
const ESTIMATED_PLUS: HandoffStatus[] = ["estimate_set", "job_booked", "won"];

export interface HandoffFunnel {
  handed: number; // total handoffs
  estimated: number; // reached estimate_set or beyond
  booked: number; // jobs booked (not yet marked fully won)
  won: number; // fully won
  lost: number;
  later: number;
  revenue: number; // sum of booked + won values
}

// The scoreboard numbers, derived from the current list. "estimated" counts any
// lead that reached an estimate OR a sold state, so the funnel never shows fewer
// estimates than sales.
export function funnel(list: ApiHandoff[]): HandoffFunnel {
  const handed = list.length;
  const booked = list.filter((h) => h.status === "job_booked").length;
  const won = list.filter((h) => h.status === "won").length;
  const lost = list.filter((h) => h.status === "lost").length;
  const later = list.filter((h) => h.status === "later").length;
  const estimated = list.filter(
    (h) => h.estimateAt || ESTIMATED_PLUS.includes(h.status),
  ).length;
  // Value is captured at Won, so revenue is the sum of Won values.
  const revenue = list
    .filter((h) => h.status === "won")
    .reduce((s, h) => s + (h.value ?? 0), 0);
  return { handed, estimated, booked, won, lost, later, revenue };
}
