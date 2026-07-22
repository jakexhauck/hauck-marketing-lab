// Pure compute for the Cold SMS surface (Acquisition > SMS). No React, no
// fetching: every rate on the page is derived here from the raw counts the
// user typed, so nothing is stored derived and nothing drifts.
//
// The month/rate primitives (pct, safeDivide, formatPct, formatNum, toInt,
// rollupColumn, countFilledDays) all come from ./trackerMonth. This module
// only adds the SMS-specific row and rollup shapes on top of them.

import {
  countFilledDays,
  formatNum,
  formatPct,
  pct,
  rollupColumn,
  safeDivide,
  toInt,
} from "./trackerMonth";

// The empty-value glyph, matching trackerMonth's formatPct/formatNum.
const EMPTY = "-";

// Raw cells as typed, keyed by column key. The tables keep values as strings
// while editing so a half-typed number never round-trips through a parse.
export type Cells = Record<string, string>;

// A per-column display map. Structurally the same as DailyTracker's RollupCells
// (declared here so this stays a pure lib with no component imports).
export type DisplayCells = Record<string, string>;

// trackerMonth.toInt is integer-only (parseInt), which is right for counts but
// wrong for money cells that carry cents, so amounts get their own parse.
// Blank or unparseable collapses to 0 for arithmetic; blankness itself is
// tracked separately by the isFilled helpers.
function toAmount(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = parseFloat(String(value ?? "").trim());
  return Number.isNaN(n) ? 0 : n;
}

function isBlank(value: string | null | undefined): boolean {
  return String(value ?? "").trim() === "";
}

// Whole dollars with thousands separators, "-" when there is nothing to show.
export function formatMoney(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return EMPTY;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

// A count with thousands separators.
export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

/* ---------------------------------------------------------------- daily --- */

export const DAILY_FIELDS = ["smsSent", "positiveReplies", "meetingsBooked"] as const;

// A day counts as logged if any of its three counts is non-blank. Notes alone
// do not make a day count toward the per-day average.
export function isDailyRowFilled(row: Cells): boolean {
  return DAILY_FIELDS.some((field) => !isBlank(row[field]));
}

// The three per-day rates, as display cells keyed to match the Daily column
// schema so this can be handed straight to DailyTracker's computeRow.
export function computeDailyRow(row: Cells): DisplayCells {
  const sent = toInt(row.smsSent);
  const replies = toInt(row.positiveReplies);
  const booked = toInt(row.meetingsBooked);
  return {
    replyPct: formatPct(pct(replies, sent)),
    replyToBookPct: formatPct(pct(booked, replies)),
    bookToSentPct: formatPct(pct(booked, sent)),
  };
}

export interface DailyRollup {
  filledDays: number;
  totals: { smsSent: number; positiveReplies: number; meetingsBooked: number };
  rates: {
    replyPct: number | null;
    replyToBookPct: number | null;
    bookToSentPct: number | null;
  };
  // Ready-to-render footer rows for DailyTracker.
  average: DisplayCells;
  total: DisplayCells;
}

// Month-to-date rollup: totals, the per-logged-day averages and the aggregate
// rates recomputed from the sums (not an average of daily rates).
export function computeDailyRollup(rows: Cells[]): DailyRollup {
  const filledDays = countFilledDays(rows, isDailyRowFilled);
  const sent = rollupColumn(rows.map((r) => toInt(r.smsSent)), filledDays);
  const replies = rollupColumn(rows.map((r) => toInt(r.positiveReplies)), filledDays);
  const booked = rollupColumn(rows.map((r) => toInt(r.meetingsBooked)), filledDays);

  const rates = {
    replyPct: pct(replies.total, sent.total),
    replyToBookPct: pct(booked.total, replies.total),
    bookToSentPct: pct(booked.total, sent.total),
  };

  return {
    filledDays,
    totals: {
      smsSent: sent.total,
      positiveReplies: replies.total,
      meetingsBooked: booked.total,
    },
    rates,
    average: {
      smsSent: formatNum(sent.average),
      positiveReplies: formatNum(replies.average),
      replyPct: formatPct(rates.replyPct),
      meetingsBooked: formatNum(booked.average, 1),
      replyToBookPct: formatPct(rates.replyToBookPct),
      bookToSentPct: formatPct(rates.bookToSentPct),
      note: "",
    },
    total: {
      smsSent: formatCount(sent.total),
      positiveReplies: formatCount(replies.total),
      replyPct: formatPct(rates.replyPct),
      meetingsBooked: formatCount(booked.total),
      replyToBookPct: formatPct(rates.replyToBookPct),
      bookToSentPct: formatPct(rates.bookToSentPct),
      note: "",
    },
  };
}

/* -------------------------------------------------------------- monthly --- */

export interface MonthlyComputed {
  showRate: number | null;
  smsPerClient: number | null;
  // null when neither cost was entered, so an untouched row stays blank rather
  // than claiming a $0 spend.
  totalCost: number | null;
  costPerCall: number | null;
  costPerShowed: number | null;
  cac: number | null;
  roi: number | null;
}

export function computeMonthlyRow(row: Cells): MonthlyComputed {
  const sent = toInt(row.totalSmsSent);
  const vaCost = toAmount(row.vaCost);
  const booked = toInt(row.callsBooked);
  const showed = toInt(row.callsShowed);
  const smsCost = toAmount(row.smsCost);
  const clients = toInt(row.newClients);
  const cash = toAmount(row.cashCollected);

  const spend = vaCost + smsCost;
  const anyCost = !isBlank(row.vaCost) || !isBlank(row.smsCost);

  return {
    showRate: pct(showed, booked),
    smsPerClient: safeDivide(sent, clients),
    totalCost: anyCost ? spend : null,
    costPerCall: safeDivide(spend, booked),
    costPerShowed: safeDivide(spend, showed),
    cac: safeDivide(spend, clients),
    // Negative when the month spent more than it collected. Null when there is
    // no spend to measure the return against.
    roi: spend > 0 ? ((cash - spend) / spend) * 100 : null,
  };
}

export interface MonthlyTotals {
  totalSmsSent: number;
  vaCost: number;
  callsBooked: number;
  callsShowed: number;
  smsCost: number;
  newClients: number;
  cashCollected: number;
}

export interface MonthlyRollup {
  totals: MonthlyTotals;
  computed: MonthlyComputed;
  // Average LTV across the months that actually recorded one. Months with a
  // blank or zero LTV would otherwise drag a real number toward zero.
  ltvAverage: number | null;
}

export function computeMonthlyRollup(rows: Cells[]): MonthlyRollup {
  const totals: MonthlyTotals = {
    totalSmsSent: 0,
    vaCost: 0,
    callsBooked: 0,
    callsShowed: 0,
    smsCost: 0,
    newClients: 0,
    cashCollected: 0,
  };
  let ltvSum = 0;
  let ltvCount = 0;

  for (const row of rows) {
    totals.totalSmsSent += toInt(row.totalSmsSent);
    totals.vaCost += toAmount(row.vaCost);
    totals.callsBooked += toInt(row.callsBooked);
    totals.callsShowed += toInt(row.callsShowed);
    totals.smsCost += toAmount(row.smsCost);
    totals.newClients += toInt(row.newClients);
    totals.cashCollected += toAmount(row.cashCollected);
    const ltv = toAmount(row.ltv);
    if (ltv > 0) {
      ltvSum += ltv;
      ltvCount += 1;
    }
  }

  // The footer's ratios come from the summed columns, so they are recomputed
  // rather than averaged from the per-row rates.
  const computed = computeMonthlyRow({
    totalSmsSent: String(totals.totalSmsSent),
    vaCost: String(totals.vaCost),
    callsBooked: String(totals.callsBooked),
    callsShowed: String(totals.callsShowed),
    smsCost: String(totals.smsCost),
    newClients: String(totals.newClients),
    cashCollected: String(totals.cashCollected),
  });

  return { totals, computed, ltvAverage: safeDivide(ltvSum, ltvCount) };
}

/* --------------------------------------------------------------- script --- */

export interface ScriptComputed {
  replyPct: number | null;
  // Booking % is booked over TOTAL SENT, not over replies: it answers "how many
  // sends does this opener need to land a call", which is what the A/B test is
  // for. Faithful to the approved mockup. Do not switch the denominator to
  // replies without Jake saying so.
  bookingPct: number | null;
}

export function computeScriptRow(row: Cells): ScriptComputed {
  const sent = toInt(row.totalSent);
  const replies = toInt(row.positiveReplies);
  const booked = toInt(row.callsBooked);
  return {
    replyPct: pct(replies, sent),
    bookingPct: pct(booked, sent),
  };
}

export interface ScriptTotals {
  totalSent: number;
  positiveReplies: number;
  callsBooked: number;
  clientsClosed: number;
}

export interface ScriptRollup {
  totals: ScriptTotals;
  computed: ScriptComputed;
}

export function computeScriptRollup(rows: Cells[]): ScriptRollup {
  const totals: ScriptTotals = {
    totalSent: 0,
    positiveReplies: 0,
    callsBooked: 0,
    clientsClosed: 0,
  };
  for (const row of rows) {
    totals.totalSent += toInt(row.totalSent);
    totals.positiveReplies += toInt(row.positiveReplies);
    totals.callsBooked += toInt(row.callsBooked);
    totals.clientsClosed += toInt(row.clientsClosed);
  }
  return {
    totals,
    computed: computeScriptRow({
      totalSent: String(totals.totalSent),
      positiveReplies: String(totals.positiveReplies),
      callsBooked: String(totals.callsBooked),
    }),
  };
}
