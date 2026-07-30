import { describe, it, expect } from "vitest";
import {
  deriveLevel,
  isPickup,
  isBooking,
  isSale,
  furthestLevel,
  rangeStart,
  rollup,
  breakdown,
  ratio,
  trackerPipelineRole,
  liveCampaignIds,
  type BreakdownEntity,
  type BreakdownLevel,
  type TrackerLead,
  assembleLeads,
  type TrackerSpendRow,
} from "./adTrackerMetrics";

// ---------------------------------------------------------------------------
// Fixture transcribed from the live Google Sheet's Dashboard tab.
//
// The BREAKDOWN table (read at full resolution) gives three ad sets:
//   Homeowners 35-65 15mi     spend 1647  leads 32  bookings 13  sales 4
//   Lookalike 1% Past Cust.   spend 1357  leads 24  bookings  8  sales 3
//   Garden Interest 20mi      spend 1504  leads 24  bookings 11  sales 2
//
// Those totals cross-validate the RESULTS row exactly: leads 80, bookings 32,
// sales 9, booking rate 40.0%, close rate 28.1%, pickups 60, pickup rate 75.0%.
// If our numbers ever stop matching these, we have diverged from the sheet.
//
// Ad-set A is split across two ads so the pivot is exercised: ad-level yields
// four rows, ad-set level three.
// ---------------------------------------------------------------------------

const DAY = "2026-03-15";

// The KPI arithmetic reads `level`, never `status`, so the fixture just needs a
// status consistent with the level it was asked for.
const STATUS_FOR_LEVEL = {
  lead: "new",
  pickup: "contacted",
  booking: "estimate_booked",
  sale: "won",
} as const;

function lead(
  n: number,
  adId: string | null,
  level: "lead" | "pickup" | "booking" | "sale",
  value = 0,
  createdAt = DAY,
): TrackerLead {
  return {
    contactId: `c${n}`,
    createdAt,
    level,
    status: STATUS_FOR_LEVEL[level],
    value,
    adId,
  };
}

// Build `count` leads on one ad at one level.
let seq = 0;
function leads(
  count: number,
  adId: string,
  level: "lead" | "pickup" | "booking" | "sale",
  value = 0,
): TrackerLead[] {
  return Array.from({ length: count }, () => lead(seq++, adId, level, value));
}

function sheetFixture(): TrackerLead[] {
  seq = 0;
  return [
    // Ad set A (ads a1 + a2): 32 leads, 13 bookings, 4 sales, 12 pickup-only
    ...leads(3, "a1", "sale", 5000),
    ...leads(5, "a1", "booking"),
    ...leads(7, "a1", "pickup"),
    ...leads(5, "a1", "lead"),
    ...leads(1, "a2", "sale", 5000),
    ...leads(4, "a2", "booking"),
    ...leads(5, "a2", "pickup"),
    ...leads(2, "a2", "lead"),
    // Ad set B (ad b1): 24 leads, 8 bookings, 3 sales, 8 pickup-only
    ...leads(3, "b1", "sale", 5000),
    ...leads(5, "b1", "booking"),
    ...leads(8, "b1", "pickup"),
    ...leads(8, "b1", "lead"),
    // Ad set C (ad c1): 24 leads, 11 bookings, 2 sales, 8 pickup-only
    ...leads(2, "c1", "sale", 5000),
    ...leads(9, "c1", "booking"),
    ...leads(8, "c1", "pickup"),
    ...leads(5, "c1", "lead"),
  ];
}

function spendRow(
  adId: string,
  adsetId: string,
  spend: number,
  date = DAY,
): TrackerSpendRow {
  return {
    date,
    adId,
    adName: `ad ${adId}`,
    adsetId,
    adsetName: `adset ${adsetId}`,
    campaignId: "camp1",
    campaignName: "Campaign One",
    spend,
    impressions: 1000,
    reach: 900,
    linkClicks: 20,
  };
}

function sheetSpend(): TrackerSpendRow[] {
  return [
    spendRow("a1", "A", 1000),
    spendRow("a2", "A", 647),
    spendRow("b1", "B", 1357),
    spendRow("c1", "C", 1504),
  ];
}

describe("ratio", () => {
  it("returns null on a zero denominator rather than 0 or Infinity", () => {
    expect(ratio(5, 0)).toBeNull();
    expect(ratio(0, 0)).toBeNull();
  });

  it("divides normally", () => {
    expect(ratio(9, 32)).toBeCloseTo(0.28125, 10);
  });
});

describe("deriveLevel", () => {
  it("maps the live Lead Form + Funnel intake stages", () => {
    expect(deriveLevel("Opted In (needs dialing)")).toBe("lead");
    expect(deriveLevel("Opted In Follow Up")).toBe("pickup");
    expect(deriveLevel("Long Term Nurture")).toBe("lead");
    // All four "No Answer Day N (needs dialing)" match by prefix.
    expect(deriveLevel("No Answer Day 1 (needs dialing)")).toBe("lead");
    expect(deriveLevel("No Answer Day 4 (needs dialing)")).toBe("lead");
    expect(deriveLevel("Survey Completed No Call Booked (needs dialing)")).toBe("pickup");
    expect(deriveLevel("Survey Follow Up")).toBe("pickup");
    expect(deriveLevel("Phone Appt Booked")).toBe("booking");
    expect(deriveLevel("Phone Appt Confirmed")).toBe("booking");
  });

  it("maps the live Sales stages", () => {
    expect(deriveLevel("Handed Off")).toBe("booking");
    expect(deriveLevel("Estimate Booked")).toBe("booking");
    expect(deriveLevel("Job Booked")).toBe("booking");
    expect(deriveLevel("Follow Up")).toBe("pickup");
  });

  it("maps the Cancelled Appointments stages to a booking", () => {
    expect(deriveLevel("Phone Appt Follow Up")).toBe("booking");
    expect(deriveLevel("Phone Appt Rescheduling")).toBe("booking");
    expect(deriveLevel("Phone Appt Unspecified")).toBe("booking");
  });

  it("maps the Trash stages to a bare lead (Lost is set from pipeline membership)", () => {
    expect(deriveLevel("Services Uninterested")).toBe("lead");
    expect(deriveLevel("Services Unqualified")).toBe("lead");
    expect(deriveLevel("Bad Intent")).toBe("lead");
    expect(deriveLevel("Lost")).toBe("lead");
  });

  it("maps the live Sales win stages to a sale", () => {
    // These replaced the old Customers pipeline, which Jake removed. Without
    // them a won lead fell through to "lead" and read as "New" on the tracker.
    expect(deriveLevel("Won")).toBe("sale");
    expect(deriveLevel("Won Recurring")).toBe("sale");
  });

  it("is case and emoji insensitive", () => {
    expect(deriveLevel("  ESTIMATE BOOKED  ")).toBe("booking");
    expect(deriveLevel("estimate booked")).toBe("booking");
  });

  it("treats an unknown stage as a bare lead rather than throwing", () => {
    expect(deriveLevel("Some New Stage Nobody Told Us About")).toBe("lead");
    expect(deriveLevel("")).toBe("lead");
  });
});

describe("trackerPipelineRole", () => {
  it("classifies the ad-lead journey pipelines as 'lead'", () => {
    expect(trackerPipelineRole("1) Lead Form Pipeline")).toBe("lead");
    expect(trackerPipelineRole("2) Funnel Pipeline")).toBe("lead");
    expect(trackerPipelineRole("3) Sales Pipeline")).toBe("lead");
    expect(trackerPipelineRole("5) Cancelled Appointments")).toBe("lead");
  });

  it("classifies Customers and Trash", () => {
    expect(trackerPipelineRole("4) Customers Pipeline")).toBe("customers");
    expect(trackerPipelineRole("6) Trash Pipeline")).toBe("trash");
  });

  // The exact names live in Willis's GHL as of 2026-07-30, after the 07-28
  // realignment. This is the regression guard for that rename: it matched none
  // of the keywords above, so the tracker returned zero leads while spend kept
  // arriving, and nothing failed loudly enough to notice.
  it("classifies the realigned four-pipeline CRM", () => {
    expect(trackerPipelineRole("1) Leads")).toBe("lead");
    expect(trackerPipelineRole("2) No Answer")).toBe("lead");
    expect(trackerPipelineRole("3) Sales")).toBe("lead");
    expect(trackerPipelineRole("4) Trash")).toBe("trash");
  });

  it("ignores pipelines that are not paid-ad leads", () => {
    expect(trackerPipelineRole("Organic")).toBeNull();
    expect(trackerPipelineRole("Google Reviews")).toBeNull();
    expect(trackerPipelineRole("Reactivation")).toBeNull();
    expect(trackerPipelineRole("News Channel")).toBeNull();
    expect(trackerPipelineRole("")).toBeNull();
  });
});

// Every stage of the four live pipelines, so a lead can never sit in a real
// stage and be counted as bare "lead" by accident.
describe("deriveLevel across the realigned pipelines", () => {
  it("reads 1) Leads", () => {
    expect(deriveLevel("Lead Form Opt In")).toBe("lead");
    expect(deriveLevel("Funnel Opt In")).toBe("lead");
    expect(deriveLevel("Lead Follow Up")).toBe("pickup");
    expect(deriveLevel("Phone Appt")).toBe("booking");
    expect(deriveLevel("Slow Burn")).toBe("lead");
    expect(deriveLevel("Long Term Nurture")).toBe("lead");
  });

  it("reads 2) No Answer as dialled-but-never-reached", () => {
    // We rang, they never picked up. No contact was made, so it is not a pickup.
    for (const day of [1, 2, 3, 4, 5, 6, 7]) {
      expect(deriveLevel(`No Answer Day ${day}`)).toBe("lead");
    }
  });

  it("reads 3) Sales", () => {
    expect(deriveLevel("Handed Off")).toBe("booking");
    expect(deriveLevel("Estimate Booked")).toBe("booking");
    expect(deriveLevel("Job Booked")).toBe("booking");
    expect(deriveLevel("Won")).toBe("sale");
    expect(deriveLevel("Follow Up")).toBe("pickup");
    // The appointment happened and then fell through. It still counts as a
    // booking for the ad that earned it.
    expect(deriveLevel("Job/Estimate Cancelled")).toBe("booking");
    expect(deriveLevel("Lost")).toBe("lead");
  });

  it("reads 4) Trash as bare leads", () => {
    expect(deriveLevel("Services Uninterested")).toBe("lead");
    expect(deriveLevel("Services Unqualified")).toBe("lead");
    expect(deriveLevel("Bad Intent")).toBe("lead");
    expect(deriveLevel("DND")).toBe("lead");
  });
});

describe("level predicates", () => {
  it("treats the ladder as cumulative: every sale is a booking is a pickup", () => {
    expect(isPickup("sale")).toBe(true);
    expect(isBooking("sale")).toBe(true);
    expect(isSale("sale")).toBe(true);

    expect(isPickup("booking")).toBe(true);
    expect(isBooking("booking")).toBe(true);
    expect(isSale("booking")).toBe(false);

    expect(isPickup("pickup")).toBe(true);
    expect(isBooking("pickup")).toBe(false);

    expect(isPickup("lead")).toBe(false);
  });
});

describe("furthestLevel", () => {
  it("picks the furthest-along level when a contact appears in two pipelines", () => {
    expect(furthestLevel(["lead", "sale", "pickup"])).toBe("sale");
    expect(furthestLevel(["lead", "pickup"])).toBe("pickup");
    expect(furthestLevel([])).toBe("lead");
  });
});

describe("rangeStart", () => {
  const now = new Date("2026-03-31T12:00:00Z");

  it("returns null for all-time so nothing is filtered", () => {
    expect(rangeStart("all", now)).toBeNull();
  });

  it("counts back N days like the sheet's TODAY()-N", () => {
    expect(rangeStart("7", now)).toBe("2026-03-24");
    expect(rangeStart("30", now)).toBe("2026-03-01");
    expect(rangeStart("90", now)).toBe("2025-12-31");
  });
});

describe("rollup against the live sheet's numbers", () => {
  const kpis = rollup(sheetFixture(), sheetSpend());

  it("matches the sheet's RESULTS row", () => {
    expect(kpis.leads).toBe(80);
    expect(kpis.pickups).toBe(60);
    expect(kpis.bookings).toBe(32);
    expect(kpis.sales).toBe(9);
  });

  it("matches the sheet's rates", () => {
    expect(kpis.pickupRate).toBeCloseTo(0.75, 10); // 75.0%
    expect(kpis.bookingRate).toBeCloseTo(0.4, 10); // 40.0%
    expect(kpis.salesPct).toBeCloseTo(0.1125, 10); // 9 / 80
    expect(kpis.closeRate).toBeCloseTo(0.28125, 10); // 28.1%, 9 / 32
  });

  it("sums revenue only from sales, and spend from the Meta rows", () => {
    expect(kpis.revenue).toBe(9 * 5000);
    expect(kpis.spend).toBe(1000 + 647 + 1357 + 1504);
    expect(kpis.roas).toBeCloseTo(45000 / 4508, 10);
  });

  it("returns null rates rather than zero when there are no leads", () => {
    const empty = rollup([], []);
    expect(empty.leads).toBe(0);
    expect(empty.pickupRate).toBeNull();
    expect(empty.closeRate).toBeNull();
    expect(empty.roas).toBeNull();
  });

  it("counts a booking that was lost, matching the sheet's Lost-is-a-booking rule", () => {
    const lost = [lead(1, "a1", "booking")]; // No Close / No-Show land here
    const k = rollup(lost, [spendRow("a1", "A", 100)]);
    expect(k.bookings).toBe(1);
    expect(k.sales).toBe(0);
    expect(k.closeRate).toBe(0);
  });
});

describe("rollup date filtering", () => {
  it("excludes leads and spend outside the range", () => {
    const rows: TrackerLead[] = [
      lead(1, "a1", "sale", 100, "2026-03-01"),
      lead(2, "a1", "sale", 100, "2026-03-20"),
    ];
    const spend = [spendRow("a1", "A", 50, "2026-03-01"), spendRow("a1", "A", 50, "2026-03-20")];
    const k = rollup(rows, spend, "2026-03-10");
    expect(k.leads).toBe(1);
    expect(k.revenue).toBe(100);
    expect(k.spend).toBe(50);
  });

  it("includes a lead landing exactly on the boundary", () => {
    const k = rollup([lead(1, "a1", "lead", 0, "2026-03-10")], [], "2026-03-10");
    expect(k.leads).toBe(1);
  });
});

describe("breakdown", () => {
  it("pivots by ad", () => {
    const rows = breakdown(sheetFixture(), sheetSpend(), "ad");
    expect(rows).toHaveLength(4);
    const a1 = rows.find((r) => r.id === "a1")!;
    expect(a1.leads).toBe(20);
    expect(a1.bookings).toBe(8);
    expect(a1.sales).toBe(3);
    expect(a1.spend).toBe(1000);
  });

  it("pivots by ad set and reproduces the sheet's three rows exactly", () => {
    const rows = breakdown(sheetFixture(), sheetSpend(), "adset");
    expect(rows).toHaveLength(3);

    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.A).toMatchObject({ spend: 1647, leads: 32, bookings: 13, sales: 4 });
    expect(byId.B).toMatchObject({ spend: 1357, leads: 24, bookings: 8, sales: 3 });
    expect(byId.C).toMatchObject({ spend: 1504, leads: 24, bookings: 11, sales: 2 });
  });

  it("pivots by campaign, collapsing every ad set into one row", () => {
    const rows = breakdown(sheetFixture(), sheetSpend(), "campaign");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "camp1", leads: 80, bookings: 32, sales: 9 });
  });

  it("computes cost per lead and per booking, null when the denominator is zero", () => {
    const rows = breakdown(
      [...leads(2, "a1", "lead")],
      [spendRow("a1", "A", 100), spendRow("z9", "Z", 500)],
      "ad",
    );
    const a1 = rows.find((r) => r.id === "a1")!;
    const z9 = rows.find((r) => r.id === "z9")!;
    expect(a1.costPerLead).toBe(50);
    expect(a1.costPerBooking).toBeNull();
    expect(z9.leads).toBe(0);
    expect(z9.costPerLead).toBeNull();
  });

  it("keeps an ad with spend but no leads, so wasted spend stays visible", () => {
    const rows = breakdown([], [spendRow("dud", "D", 250)], "ad");
    expect(rows).toHaveLength(1);
    // ROAS is 0, not null: we spent 250 and got nothing back, which is a real
    // measurement. Rendering "-" here would hide exactly the dead spend this
    // row exists to expose. Cost per lead IS null, having no leads to divide by.
    expect(rows[0]).toMatchObject({ id: "dud", spend: 250, leads: 0, roas: 0 });
    expect(rows[0].costPerLead).toBeNull();
  });

  it("excludes unattributed leads from the breakdown but keeps them in the rollup", () => {
    const rows: TrackerLead[] = [
      lead(1, "a1", "sale", 100),
      lead(2, null, "sale", 100), // no utmAdId on the contact
    ];
    const spend = [spendRow("a1", "A", 10)];

    expect(rollup(rows, spend).leads).toBe(2);
    expect(rollup(rows, spend).revenue).toBe(200);

    const b = breakdown(rows, spend, "ad");
    expect(b).toHaveLength(1);
    expect(b[0].leads).toBe(1);
    expect(b[0].revenue).toBe(100);
  });

  it("drops a lead whose ad id has no matching spend row", () => {
    // Ad deleted in Meta before the first snapshot: nothing to attribute it to.
    const b = breakdown([lead(1, "ghost", "sale", 100)], [spendRow("a1", "A", 10)], "ad");
    expect(b).toHaveLength(1);
    expect(b[0].id).toBe("a1");
    expect(b[0].leads).toBe(0);
  });

  it("is a ratio of sums, not an average of ratios", () => {
    // Two ads, wildly different efficiency. Campaign ROAS must be
    // total revenue / total spend (2000/1100), not the mean of 10 and 1.
    const rows: TrackerLead[] = [lead(1, "x", "sale", 1000), lead(2, "y", "sale", 1000)];
    const spend = [spendRow("x", "X", 100), spendRow("y", "Y", 1000)];
    const [camp] = breakdown(rows, spend, "campaign");
    expect(camp.roas).toBeCloseTo(2000 / 1100, 10);
  });

  it("sorts by spend descending, not by the sheet's row order", () => {
    // A 1647, C 1504, B 1357.
    const rows = breakdown(sheetFixture(), sheetSpend(), "adset");
    expect(rows.map((r) => r.id)).toEqual(["A", "C", "B"]);
  });
});

describe("assembleLeads", () => {
  const stages = new Map([
    ["s-new", "Opted In (needs dialing)"],
    ["s-hot", "Opted In Follow Up"],
    ["s-booked", "Phone Appt Booked"],
    ["s-won", "Won"],
  ]);
  const attr = new Map([
    ["c1", { adId: "ad1", campaignId: "k1", campaignName: "K", adsetName: "S", adName: "A" }],
    ["c2", null],
  ]);

  it("classifies an opportunity by its stage name and attaches its ad id", () => {
    const [lead] = assembleLeads(
      [{ id: "o1", contactId: "c1", pipelineStageId: "s-hot", createdAt: "2026-03-01T00:00:00Z" }],
      stages,
      attr,
      new Map(),
    );
    expect(lead).toEqual({
      contactId: "c1",
      createdAt: "2026-03-01T00:00:00Z",
      level: "pickup",
      status: "contacted",
      value: 0,
      adId: "ad1",
    });
  });

  it("dedupes a contact across pipelines, keeping the furthest level and earliest date", () => {
    const out = assembleLeads(
      [
        { id: "o1", contactId: "c1", pipelineStageId: "s-new", createdAt: "2026-03-01T00:00:00Z" },
        { id: "o2", contactId: "c1", pipelineStageId: "s-won", createdAt: "2026-03-09T00:00:00Z" },
      ],
      stages,
      attr,
      new Map(),
    );
    expect(out).toHaveLength(1);
    expect(out[0].level).toBe("sale");
    // The lead was acquired on the first date, not the date it converted.
    expect(out[0].createdAt).toBe("2026-03-01T00:00:00Z");
  });

  it("promotes a lead to a sale when the contact has a closed-out job", () => {
    const [lead] = assembleLeads(
      [{ id: "o1", contactId: "c1", pipelineStageId: "s-hot", createdAt: "2026-03-01T00:00:00Z" }],
      stages,
      attr,
      new Map([["c1", 6500]]),
    );
    expect(lead.level).toBe("sale");
    expect(lead.value).toBe(6500);
  });

  it("sums several jobs for one contact", () => {
    const [lead] = assembleLeads(
      [{ id: "o1", contactId: "c1", pipelineStageId: "s-new", createdAt: "2026-03-01T00:00:00Z" }],
      stages,
      attr,
      new Map([["c1", 6500 + 1200]]),
    );
    expect(lead.value).toBe(7700);
  });

  it("leaves a lead unattributed when the contact carries no ad", () => {
    const [lead] = assembleLeads(
      [{ id: "o1", contactId: "c2", pipelineStageId: "s-hot", createdAt: "2026-03-01T00:00:00Z" }],
      stages,
      attr,
      new Map(),
    );
    expect(lead.adId).toBeNull();
  });

  it("treats an unknown stage id as a bare lead rather than dropping it", () => {
    const [lead] = assembleLeads(
      [{ id: "o1", contactId: "c1", pipelineStageId: "gone", createdAt: "2026-03-01T00:00:00Z" }],
      stages,
      attr,
      new Map(),
    );
    expect(lead.level).toBe("lead");
  });

  it("skips an opportunity with no contact, which cannot be attributed or deduped", () => {
    expect(
      assembleLeads(
        [{ id: "o1", contactId: "", pipelineStageId: "s-hot", createdAt: "2026-03-01T00:00:00Z" }],
        stages,
        attr,
        new Map(),
      ),
    ).toHaveLength(0);
  });

  it("counts a zero-value job as a sale, since $0 close-outs are allowed", () => {
    const [lead] = assembleLeads(
      [{ id: "o1", contactId: "c1", pipelineStageId: "s-new", createdAt: "2026-03-01T00:00:00Z" }],
      stages,
      attr,
      new Map([["c1", 0]]),
    );
    expect(lead.level).toBe("sale");
    expect(lead.value).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scoping the breakdown to the live campaign (Jake's rule, 2026-07-30).
//
// The client breakdown shows the campaign they are paying for right now, with
// every ad in it listed and the ones actually running marked and sorted first.
// Results above it stays unscoped, which is why the page says which campaign it
// is showing.
// ---------------------------------------------------------------------------

function ent(
  id: string,
  level: BreakdownLevel,
  campaignId: string,
  live: boolean,
): BreakdownEntity {
  return { id, level, campaignId, name: `${level} ${id}`, live };
}

// Two campaigns: "live1" is running, "old1" is paused. Ad a1 (running) and a2
// (paused, has spent) sit in the live one; a9 sits in the paused one. Ad a3 is
// in the live campaign and has never run.
const ENTITIES: BreakdownEntity[] = [
  ent("live1", "campaign", "live1", true),
  ent("old1", "campaign", "old1", false),
  ent("a1", "ad", "live1", true),
  ent("a2", "ad", "live1", false),
  ent("a3", "ad", "live1", false),
  ent("a9", "ad", "old1", false),
];

function adSpend(adId: string, spend: number): TrackerSpendRow {
  return { ...spendRow(adId, "A", spend), adName: `ad ${adId}` };
}

describe("breakdown scoped to the live campaign", () => {
  const spend = [adSpend("a1", 80), adSpend("a2", 20), adSpend("a9", 500)];

  it("drops rows outside the live campaign", () => {
    const rows = breakdown([], spend, "ad", null, ENTITIES);
    expect(rows.map((r) => r.id).sort()).toEqual(["a1", "a2", "a3"]);
    // The paused campaign's ad spent the most, and is still gone.
    expect(rows.find((r) => r.id === "a9")).toBeUndefined();
  });

  it("lists an ad that has never run, at zero", () => {
    const a3 = breakdown([], spend, "ad", null, ENTITIES).find((r) => r.id === "a3")!;
    expect(a3).toMatchObject({ spend: 0, leads: 0, live: false });
    // Not "-": zero spend is a measured zero. The null ratios are what say
    // nothing could be divided.
    expect(a3.costPerLead).toBeNull();
  });

  it("puts what is running at the top, whatever it spent", () => {
    // a2 outspends nothing here, but a1 is the only live one, so it leads.
    const rows = breakdown([], [adSpend("a1", 1), adSpend("a2", 999)], "ad", null, ENTITIES);
    expect(rows[0].id).toBe("a1");
    expect(rows[0].live).toBe(true);
    expect(rows[1].id).toBe("a2");
  });

  it("scopes the campaign level to the live campaign itself", () => {
    const rows = breakdown([], spend, "campaign", null, ENTITIES);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "live1", live: true });
  });

  it("shows everything when no campaign is live", () => {
    // Between campaigns. A blank breakdown would be a worse answer than an
    // unfiltered one, so nothing is filtered and nothing is badged.
    const paused = ENTITIES.map((e) => ({ ...e, live: false }));
    const rows = breakdown([], spend, "ad", null, paused);
    expect(rows.map((r) => r.id).sort()).toEqual(["a1", "a2", "a9"]);
    expect(rows.every((r) => !r.live)).toBe(true);
  });

  it("shows everything when no structure has been synced", () => {
    const rows = breakdown([], spend, "ad", null, []);
    expect(rows.map((r) => r.id).sort()).toEqual(["a1", "a2", "a9"]);
  });

  it("counts leads only for the ads it kept", () => {
    const rows = breakdown(
      [...leads(3, "a1", "booking"), ...leads(5, "a9", "booking")],
      spend,
      "ad",
      null,
      ENTITIES,
    );
    expect(rows.find((r) => r.id === "a1")!.leads).toBe(3);
    expect(rows.find((r) => r.id === "a9")).toBeUndefined();
  });
});

describe("liveCampaignIds", () => {
  it("returns the live campaigns", () => {
    expect(liveCampaignIds(ENTITIES)).toEqual(new Set(["live1"]));
  });

  it("returns null when nothing is live, meaning do not filter", () => {
    expect(liveCampaignIds(ENTITIES.map((e) => ({ ...e, live: false })))).toBeNull();
    expect(liveCampaignIds([])).toBeNull();
  });

  it("ignores a live ad whose campaign is paused", () => {
    // Meta reports an ad's own status separately from its campaign's, so an ad
    // can read ACTIVE inside a paused campaign. The campaign is the authority.
    expect(liveCampaignIds([ent("old1", "campaign", "old1", false), ent("a9", "ad", "old1", true)]))
      .toBeNull();
  });
});
