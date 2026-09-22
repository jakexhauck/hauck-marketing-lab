import type { SupabaseClient } from "@supabase/supabase-js";
import { graphGetAll } from "./metaGraph";
import { actionsValue, UNIFIED_ATTRIBUTION } from "./metaActions";
import { buildAdDayUpserts, fetchAdDaysRange, trailingWindow } from "./metaAdDays";
import { replaceAdDays } from "./metaAdDayStore";
import { selectAllPages } from "./pagedSelect";

// The proof that a client's stored Meta numbers are Meta's numbers.
//
// meta_ad_days is built one ad at a time. Meta ALSO reports the whole account's
// total for each day, computed on its side, independently of our rows. If the
// two agree on every day, the copy is right; if a day disagrees, the copy is
// wrong on that day, whatever the reason (missed sync, late restatement, a
// deleted ad, a partial page). Measured 2026-09-22 before this existed: Willis
// $31.65 short over 3 days, Made Better $103.41 short over 2.
//
// So after every sync: pull the account's daily totals for the client's WHOLE
// history, compare day by day, re-pull at ad level exactly the days that
// disagree, compare again, and record the verdict. A day still wrong after the
// repair is a real problem and goes to error_log, which alarms.
//
// Compared: spend (to the cent, allowing only for per-ad rounding),
// impressions, link clicks and leads (exact). Reach is not additive across ads
// or days, so no sum of ours can be held to Meta's.

// How far back the check reaches. Meta keeps 37 months; a year and a bit covers
// every Hauck client's whole ad history, in one or two Graph pages.
export const HISTORY_DAYS = 400;
// Most days one check will re-pull. Past this the account is broken in a way a
// re-pull will not fix, and the error says so rather than hammering Meta.
export const MAX_REPAIR_DAYS = 62;
// Mismatches kept on the status row for the cockpit to show.
const KEEP_MISMATCHES = 20;

export interface DayTotals {
  spend: number;
  impressions: number;
  linkClicks: number;
  leads: number;
  // Stored ad rows that day (ours) or 1 (Meta's single account row).
  rows: number;
}

export interface DayMismatch {
  date: string;
  ours: DayTotals;
  meta: DayTotals;
}

const ZERO: DayTotals = { spend: 0, impressions: 0, linkClicks: 0, leads: 0, rows: 0 };

function n(v: unknown): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

// Stored ad-day rows -> per-day totals.
export function sumStoredByDay(
  rows: { date: string; spend: unknown; impressions: unknown; link_clicks: unknown; leads: unknown }[],
): Map<string, DayTotals> {
  const out = new Map<string, DayTotals>();
  for (const r of rows) {
    const d = out.get(r.date) ?? { ...ZERO };
    d.spend += n(r.spend);
    d.impressions += n(r.impressions);
    d.linkClicks += n(r.link_clicks);
    d.leads += n(r.leads);
    d.rows += 1;
    out.set(r.date, d);
  }
  return out;
}

// Meta's account-level daily rows -> per-day totals. Leads go through the same
// actionsValue the ad rows do, so the two sides count a lead the same way.
export function metaTotalsByDay(rows: Record<string, unknown>[]): Map<string, DayTotals> {
  const out = new Map<string, DayTotals>();
  for (const r of rows) {
    const date = String(r.date_start ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    out.set(date, {
      spend: n(r.spend),
      impressions: n(r.impressions),
      linkClicks: n(r.inline_link_clicks),
      leads: Math.round(actionsValue(r, "actions")),
      rows: 1,
    });
  }
  return out;
}

// Every day on which our stored copy and Meta's account total disagree.
//
// Spend is allowed exactly the rounding Meta itself introduces and not a cent
// more. Meta rounds each ad's spend to the cent and the account figure
// separately, so n ads can sum to strictly less than half a cent per ad plus
// half a cent off the account line. That bound is 0 for one ad (one number,
// rounded once, both sides), 1 cent for two or three, 5 cents for ten. Anything
// beyond it is a real difference. Everything else is a count and must match
// exactly.
export function diffDays(
  ours: Map<string, DayTotals>,
  meta: Map<string, DayTotals>,
): DayMismatch[] {
  const dates = [...new Set([...ours.keys(), ...meta.keys()])].sort();
  const out: DayMismatch[] = [];
  for (const date of dates) {
    const o = ours.get(date) ?? ZERO;
    const m = meta.get(date) ?? ZERO;
    const spendTolerance = 0.005 * (Math.max(o.rows, 1) + 1) - 1e-6;
    if (
      Math.abs(o.spend - m.spend) > spendTolerance ||
      o.impressions !== m.impressions ||
      o.linkClicks !== m.linkClicks ||
      o.leads !== m.leads
    ) {
      out.push({ date, ours: o, meta: m });
    }
  }
  return out;
}

// Consecutive dates grouped into ranges, so a repair of ten days in a row is
// one Graph call, not ten.
export function dateRuns(dates: string[]): { since: string; until: string }[] {
  const sorted = [...new Set(dates)].sort();
  const runs: { since: string; until: string }[] = [];
  for (const d of sorted) {
    const last = runs[runs.length - 1];
    if (last && nextDay(last.until) === d) last.until = d;
    else runs.push({ since: d, until: d });
  }
  return runs;
}

function nextDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function sumTotals(days: Map<string, DayTotals>): { spend: number; leads: number } {
  let spend = 0;
  let leads = 0;
  for (const d of days.values()) {
    spend += d.spend;
    leads += d.leads;
  }
  return { spend: Math.round(spend * 100) / 100, leads };
}

export async function fetchAccountDays(
  token: string,
  account: string,
  since: string,
  until: string,
): Promise<Map<string, DayTotals>> {
  const rows = await graphGetAll(
    token,
    `/${account}/insights`,
    {
      level: "account",
      fields: "spend,impressions,inline_link_clicks,actions",
      time_range: JSON.stringify({ since, until }),
      time_increment: "1",
      ...UNIFIED_ATTRIBUTION,
      limit: "500",
    },
    10,
    { strict: true },
  );
  return metaTotalsByDay(rows);
}

async function loadStoredDays(
  client: SupabaseClient,
  tenantId: string,
  since: string,
  until: string,
): Promise<Map<string, DayTotals>> {
  const rows = await selectAllPages<{
    date: string;
    spend: unknown;
    impressions: unknown;
    link_clicks: unknown;
    leads: unknown;
  }>((from, to) =>
    client
      .from("meta_ad_days")
      .select("date, spend, impressions, link_clicks, leads")
      .eq("tenant_id", tenantId)
      .gte("date", since)
      .lte("date", until)
      .order("date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  return sumStoredByDay(rows);
}

export interface ReconcileResult {
  ok: boolean;
  since: string;
  until: string;
  daysChecked: number;
  storedSpend: number;
  metaSpend: number;
  storedLeads: number;
  metaLeads: number;
  repairedDays: number;
  firstSpendDate: string | null;
  mismatches: DayMismatch[];
}

// Re-pull the given days at ad level and replace them in the store.
async function repairDays(
  client: SupabaseClient,
  token: string,
  tenantId: string,
  account: string,
  dates: string[],
): Promise<void> {
  for (const run of dateRuns(dates)) {
    const rows = await fetchAdDaysRange(token, account, run.since, run.until);
    const upserts = buildAdDayUpserts(rows, tenantId);
    if (upserts.length !== rows.length) {
      throw new Error(
        `Meta returned ${rows.length - upserts.length} ad rows for ${run.since}..${run.until} that could not be read`,
      );
    }
    await replaceAdDays(client, tenantId, run.since, run.until, upserts);
  }
}

export async function reconcileTenant(
  client: SupabaseClient,
  token: string,
  tenantId: string,
  adAccount: string,
  zone: string,
  now: number = Date.now(),
): Promise<ReconcileResult> {
  const account = adAccount.startsWith("act_") ? adAccount : `act_${adAccount}`;
  const { since, until } = trailingWindow(HISTORY_DAYS, zone, now);

  const meta = await fetchAccountDays(token, account, since, until);
  const ours = await loadStoredDays(client, tenantId, since, until);
  let mismatches = diffDays(ours, meta);

  let repairedDays = 0;
  // Two rounds, because "today" is still moving: Meta can add an impression
  // between the account call and the ad call. A second round settles that; a
  // day wrong after both is genuinely wrong.
  for (let round = 0; round < 2 && mismatches.length > 0; round++) {
    const dates = mismatches.map((m) => m.date);
    if (dates.length > MAX_REPAIR_DAYS) {
      throw new Error(
        `${dates.length} days disagree with Meta, more than the ${MAX_REPAIR_DAYS} one check will re-pull`,
      );
    }
    await repairDays(client, token, tenantId, account, dates);
    repairedDays += dates.length;

    const first = dates[0];
    const last = dates[dates.length - 1];
    const freshMeta = await fetchAccountDays(token, account, first, last);
    const freshOurs = await loadStoredDays(client, tenantId, first, last);
    for (const d of dates) {
      if (freshMeta.has(d)) meta.set(d, freshMeta.get(d)!);
      else meta.delete(d);
      if (freshOurs.has(d)) ours.set(d, freshOurs.get(d)!);
      else ours.delete(d);
    }
    mismatches = diffDays(ours, meta);
  }

  const metaSum = sumTotals(meta);
  const oursSum = sumTotals(ours);
  let firstSpendDate: string | null = null;
  for (const [date, t] of [...meta.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (t.spend > 0) {
      firstSpendDate = date;
      break;
    }
  }

  return {
    ok: mismatches.length === 0,
    since,
    until,
    daysChecked: new Set([...meta.keys(), ...ours.keys()]).size,
    storedSpend: oursSum.spend,
    metaSpend: metaSum.spend,
    storedLeads: oursSum.leads,
    metaLeads: metaSum.leads,
    repairedDays,
    firstSpendDate,
    mismatches,
  };
}

// The status row the cockpit reads and the launch gate keys off.
export function statusRow(tenantId: string, r: ReconcileResult, syncedAt: string) {
  return {
    tenant_id: tenantId,
    synced_at: syncedAt,
    checked_at: new Date().toISOString(),
    ok: r.ok,
    checked_since: r.since,
    checked_until: r.until,
    days_checked: r.daysChecked,
    stored_spend: r.storedSpend,
    meta_spend: r.metaSpend,
    stored_leads: r.storedLeads,
    meta_leads: r.metaLeads,
    repaired_days: r.repairedDays,
    first_spend_date: r.firstSpendDate,
    mismatches: r.mismatches.slice(0, KEEP_MISMATCHES),
    error: null,
  };
}
