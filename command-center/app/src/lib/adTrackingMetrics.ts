// Pure metrics behind the per-client daily paid-ad funnel tracker
// (/admin/delivery/:tenantId?tab=paid-ads&sub=ad-tracking). No React, no
// router, no Date.now(): "today" is always injected, so the rolling windows and
// the footer are deterministic and unit-testable.
//
// 26 columns in four bands. 13 are typed and stored; the other 13 are ratios
// derived here and NEVER persisted, so changing a formula never needs a
// backfill. A ratio whose denominator is 0 is null (unknown), rendered as the
// app's empty glyph, never a fabricated 0 and never NaN.
//
// Distinct from the client-facing src/lib/adsTracker.ts, which is a different
// sheet for a different audience.

import { daysInMonth, type MonthCursor, type TodayRef } from "./trackerMonth";
import type { TrackerColumn, RollupCells, TrackerRow } from "../components/admin/tracker/DailyTracker";

// How a value is rendered. "$" whole dollars, "$$" cents, "#" grouped integer,
// "%" one decimal, "x" a multiple.
export type MetricFormat = "$" | "$$" | "#" | "%" | "x";

export type AdTrackingBand = "spend" | "funnel" | "qualify" | "revenue";

export interface AdTrackingGroup {
  id: AdTrackingBand;
  label: string;
  // The tracker tone this band tints with (matches DailyTracker's StatTone).
  tone: "indigo" | "sky" | "amber" | "green";
}

export const AD_TRACKING_GROUPS: AdTrackingGroup[] = [
  { id: "spend", label: "Spend", tone: "indigo" },
  { id: "funnel", label: "Funnel", tone: "sky" },
  { id: "qualify", label: "Qualify", tone: "amber" },
  { id: "revenue", label: "Revenue", tone: "green" },
];

// The 13 stored inputs, keyed exactly as the wire DTO carries them.
export interface AdTrackingInputs {
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  newLeads: number;
  demosBooked: number;
  qualified: number;
  disqualified: number;
  noShow: number;
  sales: number;
  contractedRev: number;
  ufCash: number;
  newMrr: number;
}

export type AdTrackingInputKey = keyof AdTrackingInputs;

// The 13 derived ratios. null = the denominator was 0, so the answer is unknown.
export interface AdTrackingRatios {
  cpm: number | null;
  cpc: number | null;
  ctr: number | null;
  cpl: number | null;
  cpnl: number | null;
  lpConv: number | null;
  costDemo: number | null;
  leadBook: number | null;
  qualPct: number | null;
  costQual: number | null;
  cpa: number | null;
  revRoas: number | null;
  ufRoas: number | null;
}

// A tracker column, extending the shared engine's schema with the band it sits
// in and how it renders.
export interface AdTrackingColumn extends TrackerColumn {
  group: AdTrackingBand;
  format: MetricFormat;
  input: boolean;
}

function col(
  group: AdTrackingBand,
  key: string,
  label: string,
  format: MetricFormat,
  input: boolean,
): AdTrackingColumn {
  return { group, key, label, format, input, kind: input ? "input" : "computed" };
}

// Order and grouping match the approved mockup exactly (Spend 9, Funnel 5,
// Qualify 5, Revenue 7): the typed cell sits immediately before the ratios it
// feeds, so a row reads left to right as the funnel actually runs.
export const AD_TRACKING_COLUMNS: AdTrackingColumn[] = [
  col("spend", "spend", "Spend", "$", true),
  col("spend", "impressions", "Impr.", "#", true),
  col("spend", "cpm", "CPM", "$$", false),
  col("spend", "clicks", "Clicks", "#", true),
  col("spend", "cpc", "CPC", "$$", false),
  col("spend", "ctr", "CTR", "%", false),
  col("spend", "linkClicks", "Link Clk", "#", true),
  col("spend", "cpl", "CPL", "$$", false),
  col("spend", "cpnl", "CPNL", "$$", false),

  col("funnel", "newLeads", "New Leads", "#", true),
  col("funnel", "lpConv", "LP Conv", "%", false),
  col("funnel", "demosBooked", "Demos", "#", true),
  col("funnel", "costDemo", "Cost/Demo", "$", false),
  col("funnel", "leadBook", "Lead to Book", "%", false),

  col("qualify", "qualified", "Qualified", "#", true),
  col("qualify", "disqualified", "Disqual.", "#", true),
  col("qualify", "noShow", "No-Show", "#", true),
  col("qualify", "qualPct", "Qual %", "%", false),
  col("qualify", "costQual", "Cost/Qual", "$", false),

  col("revenue", "sales", "Sales", "#", true),
  col("revenue", "contractedRev", "Contract Rev", "$", true),
  col("revenue", "ufCash", "UF Cash", "$", true),
  col("revenue", "newMrr", "New MRR", "$", true),
  col("revenue", "cpa", "CPA", "$", false),
  col("revenue", "revRoas", "Rev ROAS", "x", false),
  col("revenue", "ufRoas", "UF ROAS", "x", false),
];

export const AD_TRACKING_INPUT_KEYS = AD_TRACKING_COLUMNS.filter((c) => c.input).map(
  (c) => c.key as AdTrackingInputKey,
);

export function emptyAdTrackingInputs(): AdTrackingInputs {
  return {
    spend: 0,
    impressions: 0,
    clicks: 0,
    linkClicks: 0,
    newLeads: 0,
    demosBooked: 0,
    qualified: 0,
    disqualified: 0,
    noShow: 0,
    sales: 0,
    contractedRev: 0,
    ufCash: 0,
    newMrr: 0,
  };
}

// Parse a typed cell to a number. Blank, half-typed ("1.") and junk all read as
// 0 rather than NaN, so a row never renders "NaN" mid-keystroke.
function num(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = parseFloat(String(value ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

// A ratio, or null when the denominator is 0 (unknown, not zero).
function over(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

// The 13 ratios, formulas ported verbatim from the approved mockup. Works on a
// single day's inputs OR on a window's summed inputs: summing first and
// dividing once is what makes a window a true ratio of sums.
export function computeAdTrackingRatios(input: AdTrackingInputs): AdTrackingRatios {
  const { spend, impressions, clicks, linkClicks, newLeads, demosBooked, qualified, sales } = input;
  const cpm = over(spend, impressions);
  return {
    cpm: cpm === null ? null : cpm * 1000,
    cpc: over(spend, clicks),
    ctr: pctOf(clicks, impressions),
    cpl: over(spend, linkClicks),
    cpnl: over(spend, newLeads),
    lpConv: pctOf(newLeads, linkClicks),
    costDemo: over(spend, demosBooked),
    leadBook: pctOf(demosBooked, newLeads),
    qualPct: pctOf(qualified, demosBooked),
    costQual: over(spend, qualified),
    cpa: over(spend, sales),
    revRoas: over(input.contractedRev, spend),
    ufRoas: over(input.ufCash, spend),
  };
}

function pctOf(numerator: number, denominator: number): number | null {
  const r = over(numerator, denominator);
  return r === null ? null : r * 100;
}

// Render a metric. null (unknown) renders as "-", the app's empty-value
// convention throughout the tracker.
export function formatMetric(format: MetricFormat, value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  switch (format) {
    case "$":
      return `$${Math.round(value).toLocaleString("en-US")}`;
    case "$$":
      return `$${value.toFixed(2)}`;
    case "#":
      return Math.round(value).toLocaleString("en-US");
    case "%":
      return `${value.toFixed(1)}%`;
    case "x":
      return `${value.toFixed(2)}x`;
  }
}

// Read a day's typed row into numeric inputs.
export function inputsFromRow(row: TrackerRow): AdTrackingInputs {
  const out = emptyAdTrackingInputs();
  for (const key of AD_TRACKING_INPUT_KEYS) out[key] = num(row[key]);
  return out;
}

// The engine's per-row hook: typed strings in, formatted ratio cells out.
export function computeRowCells(row: TrackerRow): RollupCells {
  const ratios = computeAdTrackingRatios(inputsFromRow(row));
  const cells: RollupCells = {};
  for (const c of AD_TRACKING_COLUMNS) {
    if (c.input) continue;
    cells[c.key] = formatMetric(c.format, ratios[c.key as keyof AdTrackingRatios]);
  }
  return cells;
}

// Has this day been logged at all? Any input carrying a value counts, including
// an explicit "0" (a real zero-spend day is logged, not blank).
function isLogged(row: TrackerRow): boolean {
  return AD_TRACKING_INPUT_KEYS.some((k) => String(row[k] ?? "").trim() !== "");
}

export interface InputSums {
  sums: AdTrackingInputs;
  filledDays: number;
}

// Sum the 13 inputs across rows, counting how many days were actually logged.
// The average divides by logged days, not the calendar length, so an unlogged
// weekend never drags the average down.
export function sumInputs(rows: TrackerRow[]): InputSums {
  const sums = emptyAdTrackingInputs();
  let filledDays = 0;
  for (const row of rows) {
    if (!isLogged(row)) continue;
    filledDays++;
    for (const key of AD_TRACKING_INPUT_KEYS) sums[key] += num(row[key]);
  }
  return { sums, filledDays };
}

export type SummaryWindow = 4 | 7 | 30 | "mtd";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// The ISO days a rolling window covers within one month. The window ends at
// today when the cursor is on today's month, otherwise at the last day of that
// month (so browsing back to June shows June's real last 7 days, not an empty
// tail anchored on today). Clamped to the 1st.
export function windowIsoDates(
  cursor: MonthCursor,
  window: SummaryWindow,
  today: TodayRef | null,
): string[] {
  const total = daysInMonth(cursor.year, cursor.month);
  const isCurrentMonth =
    !!today && today.year === cursor.year && today.month === cursor.month;
  const anchor = isCurrentMonth ? today.day : total;

  const start = window === "mtd" ? 1 : Math.max(1, anchor - window + 1);
  const out: string[] = [];
  for (let day = start; day <= anchor; day++) {
    out.push(`${cursor.year}-${pad2(cursor.month + 1)}-${pad2(day)}`);
  }
  return out;
}

export interface WindowRollup extends InputSums {
  ratios: AdTrackingRatios;
}

// Sum a window's days, then compute the ratios ONCE from those sums. Ratios of
// sums, never averages of ratios: a 400-spend day earning 200 and a 100-spend
// day earning 400 is a 1.2x window, not the 2.5x an average of daily ROAS gives.
export function rollupWindow(
  rowsByIso: Record<string, TrackerRow>,
  isoDates: string[],
): WindowRollup {
  const rows = isoDates.map((iso) => rowsByIso[iso] ?? {});
  const { sums, filledDays } = sumInputs(rows);
  return { sums, filledDays, ratios: computeAdTrackingRatios(sums) };
}

// The sticky footer: Total for the window and the per-logged-day average.
// Inputs divide by logged days; ratios are already ratios of sums, and a ratio
// of averages is arithmetically the same number, so both rows carry it.
export function buildTrackerRollup(
  sums: AdTrackingInputs,
  filledDays: number,
): { average: RollupCells; total: RollupCells } {
  const ratios = computeAdTrackingRatios(sums);
  const average: RollupCells = {};
  const total: RollupCells = {};

  for (const c of AD_TRACKING_COLUMNS) {
    if (c.input) {
      const sum = sums[c.key as AdTrackingInputKey];
      total[c.key] = formatMetric(c.format, sum);
      average[c.key] = formatMetric(c.format, filledDays > 0 ? sum / filledDays : null);
    } else {
      const value = ratios[c.key as keyof AdTrackingRatios];
      total[c.key] = formatMetric(c.format, value);
      average[c.key] = formatMetric(c.format, value);
    }
  }
  return { average, total };
}

// The eight chips in the rolling summary strip, ported from the mockup's STRIP.
export interface SummaryChip {
  key: string;
  label: string;
  tone: AdTrackingGroup["tone"];
  format: MetricFormat;
  get: (sums: AdTrackingInputs, ratios: AdTrackingRatios) => number | null;
}

export const SUMMARY_CHIPS: SummaryChip[] = [
  { key: "spend", label: "Spend", tone: "indigo", format: "$", get: (s) => s.spend },
  { key: "newLeads", label: "Leads", tone: "sky", format: "#", get: (s) => s.newLeads },
  { key: "cpnl", label: "Cost / Lead", tone: "sky", format: "$$", get: (_s, m) => m.cpnl },
  { key: "demosBooked", label: "Demos", tone: "amber", format: "#", get: (s) => s.demosBooked },
  { key: "qualified", label: "Qualified", tone: "amber", format: "#", get: (s) => s.qualified },
  { key: "sales", label: "Sales", tone: "green", format: "#", get: (s) => s.sales },
  { key: "cpa", label: "CPA", tone: "green", format: "$", get: (_s, m) => m.cpa },
  { key: "revRoas", label: "Rev ROAS", tone: "green", format: "x", get: (_s, m) => m.revRoas },
];
