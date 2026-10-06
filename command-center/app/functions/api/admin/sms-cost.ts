import type { Env, ApiData } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import { getAgencyGhlContext, isAgencyGhlConfigured } from "../../lib/agencyGhl";
import {
  EMPTY_TALLY,
  PAGE_BUDGET,
  addTallies,
  coldSmsNumber,
  daysToCount,
  fetchDay,
  fetchLookupCost,
  isFinal,
  priceTally,
  tallyMessages,
  type DayTally,
} from "../../lib/coldSmsCost";
import { normalizeInputs, startingBudget } from "../../../src/lib/coldSmsBudget";

// GET /api/admin/sms-cost?month=YYYY-MM: the automatic cold SMS cost for one
// month, for the Budget page. Syncs any day not yet final (at most PAGE_BUDGET
// export pages a call) and answers with what it has plus `pendingDays`, so the
// page polls until a long-unseen month is filled in. Owner only (no role rule
// opens it). See functions/lib/coldSmsCost.ts.

interface DailyRow {
  day: string;
  out_count: number;
  out_segments: number;
  in_count: number;
  in_segments: number;
  synced_at: string;
}

function toTally(r: DailyRow): DayTally {
  return {
    outCount: r.out_count,
    outSegments: r.out_segments,
    inCount: r.in_count,
    inSegments: r.in_segments,
  };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const month = new URL(ctx.request.url).searchParams.get("month") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return Response.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const days = daysToCount(month, today);

  const [daily, budgets] = await Promise.all([
    days.length
      ? client
          .from("cold_sms_cost_daily")
          .select("day, out_count, out_segments, in_count, in_segments, synced_at")
          .gte("day", days[0])
          .lte("day", days[days.length - 1])
      : Promise.resolve({ data: [] as DailyRow[], error: null }),
    client.from("cold_sms_budget").select("month, inputs"),
  ]);
  if (daily.error) return Response.json({ error: daily.error.message }, { status: 500 });
  if (budgets.error) return Response.json({ error: budgets.error.message }, { status: 500 });

  const byDay = new Map<string, DailyRow>();
  for (const r of (daily.data ?? []) as DailyRow[]) byDay.set(r.day, r);

  // Newest unsynced days first, so today's number is always fresh.
  const stale = days.filter((d) => {
    const row = byDay.get(d);
    return !row || !isFinal(d, row.synced_at);
  }).reverse();

  let syncError: string | null = null;
  const fresh: DailyRow[] = [];
  if (stale.length && isAgencyGhlConfigured(ctx.env)) {
    const ghl = getAgencyGhlContext(ctx.env);
    const number = coldSmsNumber(ctx.env);
    const budget = { pages: PAGE_BUDGET };
    for (const day of stale) {
      let messages;
      try {
        messages = await fetchDay(ghl, day, budget);
      } catch (e) {
        syncError = e instanceof Error ? e.message : String(e);
        break;
      }
      if (!messages) break;
      const t = tallyMessages(messages, number);
      const row: DailyRow = {
        day,
        out_count: t.outCount,
        out_segments: t.outSegments,
        in_count: t.inCount,
        in_segments: t.inSegments,
        synced_at: now.toISOString(),
      };
      fresh.push(row);
      byDay.set(day, row);
    }
    if (fresh.length) {
      const { error } = await client.from("cold_sms_cost_daily").upsert(fresh, { onConflict: "day" });
      if (error) syncError = error.message;
    }
  } else if (stale.length) {
    syncError = "agency GHL not configured";
  }

  const freshDays = new Set(fresh.map((r) => r.day));
  const pendingDays = stale.filter((d) => !freshDays.has(d)).length;

  let tally = EMPTY_TALLY;
  for (const d of days) {
    const r = byDay.get(d);
    if (r) tally = addTallies(tally, toTally(r));
  }

  const rows = ((budgets.data ?? []) as { month: string; inputs: unknown }[]).map((r) => ({
    month: r.month,
    inputs: normalizeInputs(r.inputs),
  }));
  const inputs = startingBudget(rows, month);
  // A month that has not started yet has no flat fees to show either.
  const cost = days.length ? priceTally(tally, inputs) : { texts: 0, replies: 0, fixed: 0, total: 0 };

  const lookup = days.length ? await fetchLookupCost(ctx.env, month).catch(() => null) : { count: 0, cost: 0 };

  return Response.json({
    month,
    texts: { ...tally, cost: cost.texts + cost.replies },
    fixed: cost.fixed,
    lookup,
    total: cost.total + (lookup?.cost ?? 0),
    pendingDays,
    error: syncError,
  });
};
