import { describe, it, expect, vi, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  dateRuns,
  diffDays,
  metaTotalsByDay,
  reconcileTenant,
  sumStoredByDay,
  type DayTotals,
} from "./metaReconcile";
import { staleRowIds } from "./metaAdDayStore";
import { syncAndVerifyTenant } from "./metaSync";

afterEach(() => {
  vi.unstubAllGlobals();
});

const day = (spend: number, impressions = 100, linkClicks = 5, leads = 1, rows = 1): DayTotals => ({
  spend,
  impressions,
  linkClicks,
  leads,
  rows,
});

describe("diffDays", () => {
  it("passes identical days", () => {
    const ours = new Map([["2026-09-01", day(10)]]);
    const meta = new Map([["2026-09-01", day(10)]]);
    expect(diffDays(ours, meta)).toEqual([]);
  });

  it("flags a day Meta has and we do not (the missed-cron case)", () => {
    const ours = new Map<string, DayTotals>();
    const meta = new Map([["2026-09-21", day(20.13, 376, 8, 0)]]);
    const out = diffDays(ours, meta);
    expect(out.map((m) => m.date)).toEqual(["2026-09-21"]);
    expect(out[0].ours.spend).toBe(0);
  });

  it("flags a day we have and Meta no longer reports", () => {
    const ours = new Map([["2026-09-01", day(5)]]);
    expect(diffDays(ours, new Map()).map((m) => m.date)).toEqual(["2026-09-01"]);
  });

  it("flags a 27 cent restatement (Willis, 2026-08-18)", () => {
    const ours = new Map([["2026-08-18", day(16.4, 458, 14, 3)]]);
    const meta = new Map([["2026-08-18", day(16.67, 463, 14, 3)]]);
    expect(diffDays(ours, meta)).toHaveLength(1);
  });

  it("flags a single cent off on a one-ad day", () => {
    const ours = new Map([["2026-09-20", day(27.43, 519, 18, 1, 1)]]);
    const meta = new Map([["2026-09-20", day(27.44, 519, 18, 1)]]);
    expect(diffDays(ours, meta)).toHaveLength(1);
  });

  it("allows per-ad rounding across many ads, and no more", () => {
    // Ten ads, each rounded to the cent by Meta: up to 5.5 cents of honest drift.
    const ours = new Map([["2026-09-01", day(100.05, 100, 5, 1, 10)]]);
    const meta = new Map([["2026-09-01", day(100.0)]]);
    expect(diffDays(ours, meta)).toEqual([]);
    const off = new Map([["2026-09-01", day(100.06, 100, 5, 1, 10)]]);
    expect(diffDays(off, meta)).toHaveLength(1);
  });

  it("holds impressions, clicks and leads to exact", () => {
    const meta = new Map([["d", day(10, 100, 5, 1)]]);
    expect(diffDays(new Map([["d", day(10, 101, 5, 1)]]), meta)).toHaveLength(1);
    expect(diffDays(new Map([["d", day(10, 100, 6, 1)]]), meta)).toHaveLength(1);
    expect(diffDays(new Map([["d", day(10, 100, 5, 2)]]), meta)).toHaveLength(1);
  });
});

describe("metaTotalsByDay", () => {
  it("counts leads with the roll-up, never roll-up plus parts", () => {
    const out = metaTotalsByDay([
      {
        date_start: "2026-08-10",
        spend: "12.50",
        impressions: "300",
        inline_link_clicks: "9",
        actions: [
          { action_type: "lead", value: "26" },
          { action_type: "offsite_conversion.fb_pixel_lead", value: "22" },
          { action_type: "onsite_conversion.lead_grouped", value: "4" },
        ],
      },
    ]);
    expect(out.get("2026-08-10")).toEqual(day(12.5, 300, 9, 26));
  });
});

describe("sumStoredByDay", () => {
  it("sums every ad on a day and counts the rows", () => {
    const out = sumStoredByDay([
      { date: "d", spend: "1.10", impressions: "10", link_clicks: "1", leads: 1 },
      { date: "d", spend: "2.20", impressions: "20", link_clicks: "2", leads: 0 },
    ]);
    expect(out.get("d")!.spend).toBeCloseTo(3.3, 10);
    expect(out.get("d")!.rows).toBe(2);
  });
});

describe("dateRuns", () => {
  it("groups consecutive dates, across a month end", () => {
    expect(dateRuns(["2026-09-02", "2026-08-31", "2026-09-01", "2026-09-05"])).toEqual([
      { since: "2026-08-31", until: "2026-09-02" },
      { since: "2026-09-05", until: "2026-09-05" },
    ]);
  });
});

describe("staleRowIds", () => {
  it("returns stored rows Meta no longer reported", () => {
    const stored = [
      { id: "1", date: "2026-09-01", ad_id: "a" },
      { id: "2", date: "2026-09-01", ad_id: "b" },
    ];
    expect(staleRowIds(stored, [{ date: "2026-09-01", ad_id: "a" }])).toEqual(["2"]);
  });
});

// ---------------------------------------------------------------------------
// End to end, against a fake Meta and a fake database: a stored history with a
// missing day, a restated day and a row Meta no longer reports, synced once.
// The proof is that afterwards every stored day equals Meta's account total.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

// Just enough of the supabase-js builder for the sync path: select / upsert /
// delete / update with eq, gte, lte, lt, in, order, range, maybeSingle.
function fakeDb(tables: Record<string, Row[]>) {
  let nextId = 1000;
  class Q {
    private filters: ((r: Row) => boolean)[] = [];
    private op: "select" | "delete" | "update" = "select";
    private patch: Row = {};
    private from_ = 0;
    private to_ = Infinity;
    private orders: { col: string; asc: boolean }[] = [];
    private single = false;
    constructor(private table: string) {}
    select() { return this; }
    eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
    gte(c: string, v: string) { this.filters.push((r) => String(r[c]) >= v); return this; }
    lte(c: string, v: string) { this.filters.push((r) => String(r[c]) <= v); return this; }
    lt(c: string, v: string) { this.filters.push((r) => String(r[c]) < v); return this; }
    in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
    order(col: string, o?: { ascending?: boolean }) { this.orders.push({ col, asc: o?.ascending !== false }); return this; }
    range(a: number, b: number) { this.from_ = a; this.to_ = b; return this; }
    maybeSingle() { this.single = true; return this; }
    delete() { this.op = "delete"; return this; }
    update(p: Row) { this.op = "update"; this.patch = p; return this; }
    upsert(rows: Row | Row[], o: { onConflict: string }) {
      const keys = o.onConflict.split(",");
      const t = (tables[this.table] ??= []);
      for (const row of Array.isArray(rows) ? rows : [rows]) {
        const hit = t.find((r) => keys.every((k) => r[k] === row[k]));
        if (hit) Object.assign(hit, row);
        else t.push({ id: String(nextId++), ...row });
      }
      return Promise.resolve({ data: null, error: null });
    }
    then(ok?: (v: { data: unknown; error: null }) => unknown, bad?: (e: unknown) => unknown) {
      const t = (tables[this.table] ??= []);
      const hits = t.filter((r) => this.filters.every((f) => f(r)));
      let data: unknown = null;
      if (this.op === "delete") tables[this.table] = t.filter((r) => !hits.includes(r));
      else if (this.op === "update") hits.forEach((r) => Object.assign(r, this.patch));
      else {
        const sorted = [...hits].sort((a, b) => {
          for (const o of this.orders) {
            const x = String(a[o.col]);
            const y = String(b[o.col]);
            if (x !== y) return (x < y ? -1 : 1) * (o.asc ? 1 : -1);
          }
          return 0;
        });
        const page = sorted.slice(this.from_, this.to_ + 1).map((r) => ({ ...r }));
        data = this.single ? page[0] ?? null : page;
      }
      return Promise.resolve({ data, error: null }).then(ok, bad);
    }
  }
  return { from: (t: string) => new Q(t) } as unknown as SupabaseClient;
}

// Meta, as a function of what it "knows": per-ad rows by date.
function fakeMeta(adRows: Row[]) {
  return vi.fn(async (url: string) => {
    const u = new URL(url);
    const json = (body: unknown) => ({ ok: true, json: async () => body, text: async () => "" });
    if (u.pathname.endsWith("/act_1")) return json({ timezone_name: "America/Chicago" });
    if (u.pathname.match(/\/(campaigns|adsets|ads)$/)) return json({ data: [] });
    const range = JSON.parse(u.searchParams.get("time_range") ?? "{}") as { since: string; until: string };
    const inRange = adRows.filter((r) => String(r.date_start) >= range.since && String(r.date_start) <= range.until);
    if (u.searchParams.get("level") === "ad") return json({ data: inRange });
    const byDay = new Map<string, { spend: number; impressions: number; clicks: number; leads: number }>();
    for (const r of inRange) {
      const d = byDay.get(String(r.date_start)) ?? { spend: 0, impressions: 0, clicks: 0, leads: 0 };
      d.spend += Number(r.spend);
      d.impressions += Number(r.impressions);
      d.clicks += Number(r.inline_link_clicks);
      d.leads += Number((r.actions as { value: string }[] | undefined)?.[0]?.value ?? 0);
      byDay.set(String(r.date_start), d);
    }
    return json({
      data: [...byDay].map(([date, d]) => ({
        date_start: date,
        spend: d.spend.toFixed(2),
        impressions: String(d.impressions),
        inline_link_clicks: String(d.clicks),
        actions: d.leads ? [{ action_type: "lead", value: String(d.leads) }] : undefined,
      })),
    });
  });
}

const metaAd = (date: string, ad: string, spend: string, leads = 0): Row => ({
  date_start: date,
  ad_id: ad,
  ad_name: ad,
  adset_id: "s",
  campaign_id: "c",
  spend,
  impressions: "100",
  reach: "80",
  inline_link_clicks: "4",
  actions: leads ? [{ action_type: "lead", value: String(leads) }] : undefined,
});

const storedAd = (id: string, date: string, ad: string, spend: number, leads = 0): Row => ({
  id,
  tenant_id: "t1",
  date,
  ad_id: ad,
  spend,
  impressions: 100,
  reach: 80,
  link_clicks: 4,
  leads,
});

describe("syncAndVerifyTenant (end to end)", () => {
  it("repairs an old restated day, a missing day and a stale row, then proves the match", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T20:00:00Z"));
    try {
      const meta = [
        metaAd("2026-08-18", "a", "16.67", 3), // restated after our 7-day window
        metaAd("2026-09-20", "a", "27.44", 1),
        metaAd("2026-09-21", "a", "20.13"), // we never synced this day
        metaAd("2026-09-22", "a", "11.24"),
      ];
      vi.stubGlobal("fetch", fakeMeta(meta));

      const tables: Record<string, Row[]> = {
        tenants: [{ id: "t1", meta_timezone: "America/Chicago" }],
        meta_ad_days: [
          storedAd("1", "2026-08-18", "a", 16.4, 3), // 27 cents short, 35 days old
          storedAd("2", "2026-09-20", "a", 27.43, 1),
          storedAd("3", "2026-09-20", "gone", 5.0), // Meta no longer reports this ad
        ],
      };
      const db = fakeDb(tables);

      const r = await syncAndVerifyTenant(
        db,
        "tok",
        { id: "t1", name: "Test", meta_ad_account_id: "act_1", meta_timezone: "America/Chicago" },
        7,
      );

      expect(r.error).toBeUndefined();
      expect(r.verified).toBe(true);
      expect(r.repairedDays).toBe(1); // only Aug 18: the trailing sync fixed the rest

      const byDate = new Map<string, number>();
      for (const row of tables.meta_ad_days) {
        byDate.set(String(row.date), (byDate.get(String(row.date)) ?? 0) + Number(row.spend));
      }
      expect(Object.fromEntries(byDate)).toEqual({
        "2026-08-18": 16.67,
        "2026-09-20": 27.44,
        "2026-09-21": 20.13,
        "2026-09-22": 11.24,
      });
      expect(tables.meta_ad_days.some((row) => row.ad_id === "gone")).toBe(false);

      const status = tables.meta_sync_status[0];
      expect(status.ok).toBe(true);
      expect(status.meta_spend).toBe(75.48);
      expect(status.stored_spend).toBe(75.48);
      expect(status.first_spend_date).toBe("2026-08-18");
    } finally {
      vi.useRealTimers();
    }
  });

  it("records a failure instead of saving part of a failed Meta read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (new URL(url).pathname.endsWith("/act_1")) {
          return { ok: true, json: async () => ({ timezone_name: "UTC" }) };
        }
        return { ok: false, status: 500, text: async () => "boom", json: async () => ({}) };
      }),
    );
    const tables: Record<string, Row[]> = {
      tenants: [{ id: "t1" }],
      meta_ad_days: [storedAd("1", "2026-09-20", "a", 10)],
      meta_sync_status: [{ tenant_id: "t1", ok: true, first_spend_date: "2026-01-01" }],
    };
    const r = await syncAndVerifyTenant(
      fakeDb(tables),
      "tok",
      { id: "t1", name: "Test", meta_ad_account_id: "act_1", meta_timezone: "UTC" },
      7,
    );
    expect(r.error).toMatch(/Meta 500/);
    expect(tables.meta_ad_days).toHaveLength(1); // nothing deleted on a failed read
    expect(tables.meta_sync_status[0].ok).toBe(false);
    // A failed check never un-launches a client.
    expect(tables.meta_sync_status[0].first_spend_date).toBe("2026-01-01");
  });

  it("reports ok=false when a day still disagrees after the repair", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T20:00:00Z"));
    try {
      // Meta's account total says $10, its ad rows only ever add to $9: the kind
      // of disagreement a re-pull cannot fix, which must be reported, not hidden.
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          const u = new URL(url);
          const json = (body: unknown) => ({ ok: true, json: async () => body, text: async () => "" });
          if (u.searchParams.get("level") === "ad") return json({ data: [metaAd("2026-09-01", "a", "9.00")] });
          return json({ data: [{ date_start: "2026-09-01", spend: "10.00", impressions: "100", inline_link_clicks: "4" }] });
        }),
      );
      const tables: Record<string, Row[]> = { meta_ad_days: [] };
      const r = await reconcileTenant(fakeDb(tables), "tok", "t1", "act_1", "UTC");
      expect(r.ok).toBe(false);
      expect(r.mismatches.map((m) => m.date)).toEqual(["2026-09-01"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
