import { describe, it, expect } from "vitest";
import {
  deriveLevel,
  isPickup,
  isBooking,
  isSale,
  furthestLevel,
  rangeWindow,
  inWindow,
  rollup,
  breakdown,
  ratio,
  trackerPipelineRole,
  liveCampaignIds,
  OTHER_ID,
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

// `leadCount` is Meta's own lead count for that ad on that day, which is where
// every Leads figure now comes from. It sits before `date` because almost every
// test cares about it and almost none care about the date.
function spendRow(
  adId: string,
  adsetId: string,
  spend: number,
  leadCount = 0,
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
    leads: leadCount,
    // Meta's own booked-appointment count. Zero throughout this file: the sheet
    // fixture predates bookings being reported back to Meta, and the KPI
    // arithmetic still takes Bookings from the CRM.
    metaBookings: 0,
  };
}

// The Meta side of the sheet fixture. The per-ad lead counts are the same
// numbers the CRM fixture above carries (a1 20, a2 12, b1 24, c1 24), so ad set
// A still totals 32 and the account still totals 80. That is deliberate: the
// sheet's cross-validation has to keep holding now that Leads comes from Meta
// rather than from counting contacts.
function sheetSpend(): TrackerSpendRow[] {
  return [
    spendRow("a1", "A", 1000, 20),
    spendRow("a2", "A", 647, 12),
    spendRow("b1", "B", 1357, 24),
    spendRow("c1", "C", 1504, 24),
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

// Every expectation here is transcribed from a live probe of Willis's ad
// account (act_27110669075184924) on 2026-08-13, one call per preset with
// time_increment=1, reading Meta's own first and last date_start. They are not
// derived from Meta's documentation and they are not what a tidy implementation
// would produce. See rangeWindow().
describe("rangeWindow matches Ads Manager's presets", () => {
  // 2026-08-13 18:11 EST. Deliberately an instant that is ALREADY the next day
  // in UTC, which is exactly the case the old Date.UTC implementation got wrong.
  const now = new Date("2026-08-13T23:11:00Z");
  const EST = "EST";

  it("treats today as today in the ad account's zone, not UTC's", () => {
    expect(rangeWindow("today", now, EST)).toEqual({
      start: "2026-08-13",
      end: "2026-08-13",
    });
    // The same instant is already the 14th in Tokyo, and Meta would bucket it
    // there. Proves the zone is doing the work rather than being decoration.
    expect(rangeWindow("today", now, "Asia/Tokyo")).toEqual({
      start: "2026-08-14",
      end: "2026-08-14",
    });
  });

  it("ends the last_Nd presets YESTERDAY, the way Meta does", () => {
    expect(rangeWindow("last_7d", now, EST)).toEqual({
      start: "2026-08-06",
      end: "2026-08-12",
    });
    expect(rangeWindow("last_14d", now, EST)).toEqual({
      start: "2026-07-30",
      end: "2026-08-12",
    });
    expect(rangeWindow("last_30d", now, EST)).toEqual({
      start: "2026-07-14",
      end: "2026-08-12",
    });
  });

  it("includes today in this_month, which last_7d does not", () => {
    // Meta's own inconsistency, reproduced on purpose.
    expect(rangeWindow("this_month", now, EST)).toEqual({
      start: "2026-08-01",
      end: "2026-08-13",
    });
  });

  it("closes last_month on the last day of the previous month", () => {
    expect(rangeWindow("last_month", now, EST)).toEqual({
      start: "2026-07-01",
      end: "2026-07-31",
    });
    // Across a year boundary, and out of a 31-day month into a 30-day one.
    expect(rangeWindow("last_month", new Date("2026-01-09T12:00:00Z"), EST)).toEqual({
      start: "2025-12-01",
      end: "2025-12-31",
    });
  });

  it("leaves maximum unbounded at both ends", () => {
    expect(rangeWindow("maximum", now, EST)).toEqual({ start: null, end: null });
  });

  it("counts back over a month boundary without landing on day zero", () => {
    const mar1 = new Date("2026-03-01T18:00:00Z");
    expect(rangeWindow("last_7d", mar1, EST)).toEqual({
      start: "2026-02-22",
      end: "2026-02-28",
    });
  });
});

describe("inWindow", () => {
  const w = { start: "2026-03-10", end: "2026-03-20" };

  it("includes both boundary days", () => {
    expect(inWindow("2026-03-10", w)).toBe(true);
    expect(inWindow("2026-03-20", w)).toBe(true);
  });

  it("excludes the days either side", () => {
    expect(inWindow("2026-03-09", w)).toBe(false);
    expect(inWindow("2026-03-21", w)).toBe(false);
  });

  it("treats an unbounded end as open", () => {
    expect(inWindow("2030-01-01", { start: "2026-03-10", end: null })).toBe(true);
    expect(inWindow("1999-01-01", { start: null, end: "2026-03-10" })).toBe(true);
  });

  it("reads the date out of a full timestamp", () => {
    expect(inWindow("2026-03-15T22:41:03.000Z", w)).toBe(true);
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

  it("takes Leads from Meta and reports the CRM's own count separately", () => {
    // The fixture is built so both agree at 80. They agree here and nowhere
    // else in real life: Willis reads Meta 51, CRM 6 for the same thirty days.
    // What matters is that `leads` is read off the Meta rows, so a CRM that has
    // lost half its leads can no longer drag the headline figure down with it.
    const halfLost = rollup(sheetFixture().slice(0, 40), sheetSpend());
    expect(halfLost.leads).toBe(80);
    expect(halfLost.crmLeads).toBe(40);
  });

  it("counts no leads at all when Meta has not been synced", () => {
    // Spend rows exist but carry no lead counts (every row before migration
    // 0108 backfilled). Zero is the honest answer; falling back to counting
    // contacts is what produced the number this whole rebuild exists to kill.
    const unsynced = rollup(sheetFixture(), [spendRow("a1", "A", 1000)]);
    expect(unsynced.leads).toBe(0);
    expect(unsynced.crmLeads).toBe(80);
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
    const k = rollup(lost, [spendRow("a1", "A", 100, 1)]);
    expect(k.bookings).toBe(1);
    expect(k.sales).toBe(0);
    expect(k.closeRate).toBe(0);
  });

  it("divides the rates by Meta's leads, not the CRM's", () => {
    // Meta reported 10 leads; only 2 ever reached the CRM, and one booked.
    // Booking rate is 1/10, not 1/2. Dividing by the CRM count would report a
    // 50% booking rate on a campaign that is actually converting at 10%, which
    // is precisely the flattery this page must not offer.
    const k = rollup([lead(1, "a1", "booking"), lead(2, "a1", "lead")], [
      spendRow("a1", "A", 100, 10),
    ]);
    expect(k.leads).toBe(10);
    expect(k.crmLeads).toBe(2);
    expect(k.bookingRate).toBeCloseTo(0.1, 10);
  });
});

describe("rollup date filtering", () => {
  const W = { start: "2026-03-10", end: "2026-03-31" };

  it("excludes leads and spend outside the window", () => {
    const rows: TrackerLead[] = [
      lead(1, "a1", "sale", 100, "2026-03-01"),
      lead(2, "a1", "sale", 100, "2026-03-20"),
    ];
    const spend = [
      spendRow("a1", "A", 50, 3, "2026-03-01"),
      spendRow("a1", "A", 50, 4, "2026-03-20"),
    ];
    const k = rollup(rows, spend, W);
    expect(k.leads).toBe(4);
    expect(k.crmLeads).toBe(1);
    expect(k.revenue).toBe(100);
    expect(k.spend).toBe(50);
  });

  it("includes a lead landing exactly on the boundary", () => {
    const k = rollup([lead(1, "a1", "lead", 0, "2026-03-10")], [], W);
    expect(k.crmLeads).toBe(1);
  });

  it("excludes what falls past the END of the window", () => {
    // The old implementation had no end at all, so "Last 7 days" silently
    // included today and could never agree with Meta's version of it.
    const spend = [
      spendRow("a1", "A", 50, 4, "2026-03-31"),
      spendRow("a1", "A", 50, 9, "2026-04-01"),
    ];
    const k = rollup([], spend, W);
    expect(k.leads).toBe(4);
    expect(k.spend).toBe(50);
  });

  it("buckets a CRM lead by the ad account's day, not UTC's", () => {
    // 2026-03-20 21:30 EST is already the 21st in UTC. Meta would put the ad
    // impression that produced it on the 20th, so the lead belongs there too.
    const late = [lead(1, "a1", "lead", 0, "2026-03-21T02:30:00Z")];
    expect(rollup(late, [], { start: "2026-03-20", end: "2026-03-20" }, "EST").crmLeads).toBe(1);
    expect(rollup(late, [], { start: "2026-03-21", end: "2026-03-21" }, "EST").crmLeads).toBe(0);
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

  it("adds up to the Results row, because both count the same Meta rows", () => {
    // The property that could not hold before 2026-08-13. Results counted CRM
    // contacts and the breakdown counted only the attributed subset, so the two
    // never reconciled and the payload had to publish an `unattributed` figure
    // to explain the difference away.
    const summed = breakdown(sheetFixture(), sheetSpend(), "ad").reduce(
      (n, r) => n + r.leads,
      0,
    );
    expect(summed).toBe(rollup(sheetFixture(), sheetSpend()).leads);
  });

  it("computes cost per lead and per booking, null when the denominator is zero", () => {
    const rows = breakdown(
      [...leads(2, "a1", "lead")],
      [spendRow("a1", "A", 100, 2), spendRow("z9", "Z", 500, 0)],
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

  it("counts a lead Meta reported even when no CRM contact ever arrived", () => {
    // Willis's Instant Form campaigns, in miniature: Meta reported the lead and
    // billed for it, and nothing reached the CRM. The row must still show it.
    const b = breakdown([], [spendRow("a1", "A", 100, 7)], "ad");
    expect(b[0]).toMatchObject({ leads: 7, bookings: 0 });
    expect(b[0].costPerLead).toBeCloseTo(100 / 7, 10);
  });

  it("attributes a booking to its ad without touching the lead count", () => {
    const rows: TrackerLead[] = [
      lead(1, "a1", "sale", 100),
      lead(2, null, "sale", 100), // no utmAdId on the contact
    ];
    const spend = [spendRow("a1", "A", 10, 5)];

    // Meta's five, not the CRM's two.
    expect(rollup(rows, spend).leads).toBe(5);
    expect(rollup(rows, spend).revenue).toBe(200);

    const b = breakdown(rows, spend, "ad");
    expect(b).toHaveLength(1);
    expect(b[0].leads).toBe(5);
    // Only the attributed sale can be placed on an ad.
    expect(b[0].revenue).toBe(100);
  });

  it("drops a booking whose ad id has no matching spend row", () => {
    // Ad deleted in Meta before the first snapshot: nothing to attribute it to.
    const b = breakdown([lead(1, "ghost", "sale", 100)], [spendRow("a1", "A", 10, 2)], "ad");
    expect(b).toHaveLength(1);
    expect(b[0].id).toBe("a1");
    expect(b[0].sales).toBe(0);
    expect(b[0].leads).toBe(2);
  });

  it("is a ratio of sums, not an average of ratios", () => {
    // Two ads, wildly different efficiency. Campaign ROAS must be
    // total revenue / total spend (2000/1100), not the mean of 10 and 1.
    const rows: TrackerLead[] = [lead(1, "x", "sale", 1000), lead(2, "y", "sale", 1000)];
    const spend = [spendRow("x", "X", 100, 1), spendRow("y", "Y", 1000, 1)];
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

function adSpend(adId: string, spend: number, leadCount = 0): TrackerSpendRow {
  return { ...spendRow(adId, "A", spend, leadCount), adName: `ad ${adId}` };
}

describe("breakdown scoped to the live campaign", () => {
  const spend = [adSpend("a1", 80), adSpend("a2", 20), adSpend("a9", 500)];

  it("names no ad outside the live campaign, but keeps its spend in one row", () => {
    const rows = breakdown([], spend, "ad", null, ENTITIES);
    expect(rows.map((r) => r.id).sort()).toEqual(["__other__", "a1", "a2", "a3"]);
    // The paused campaign's ad is still not named or listed...
    expect(rows.find((r) => r.id === "a9")).toBeUndefined();
    // ...but the $500 it burned is not swept off the page either. Dropping it
    // outright is what made Results and the breakdown disagree by $609 on
    // Willis Windows with nothing on screen to say why.
    expect(rows.find((r) => r.id === OTHER_ID)).toMatchObject({
      spend: 500,
      name: "Other ads",
      live: false,
    });
  });

  it("adds up to the same spend the Results block reports", () => {
    // The property that matters: the two blocks sit on one screen, so the
    // column has to reconcile with the total above it for every level.
    for (const level of ["campaign", "adset", "ad"] as BreakdownLevel[]) {
      const rows = breakdown([], spend, level, null, ENTITIES);
      const summed = rows.reduce((n, r) => n + r.spend, 0);
      expect(summed).toBe(rollup([], spend).spend);
    }
  });

  it("pins the reconciling row last even when it outspent everything", () => {
    const rows = breakdown([], spend, "ad", null, ENTITIES);
    // a9's campaign spent 500 against the live campaign's 100. The row exists
    // so the column adds up, not to be the first thing the client reads.
    expect(rows[rows.length - 1].id).toBe(OTHER_ID);
    expect(rows[0].id).toBe("a1");
  });

  it("creates no reconciling row when the scope excluded nothing", () => {
    const rows = breakdown([], [adSpend("a1", 80), adSpend("a2", 20)], "ad", null, ENTITIES);
    expect(rows.find((r) => r.id === OTHER_ID)).toBeUndefined();
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
    expect(rows[0]).toMatchObject({ id: "live1", live: true });
    // The paused campaign is not named; its spend rides in the reconciling row.
    expect(rows.find((r) => r.id === "old1")).toBeUndefined();
    // Every spend row in this fixture carries campaignId "camp1", which is
    // neither entity, so at campaign level the live row is a seeded zero and
    // all 600 reconciles through the aggregate. The point being pinned is that
    // none of it goes missing, whichever campaign the spend belongs to.
    expect(rows.find((r) => r.id === OTHER_ID)).toMatchObject({
      spend: 600,
      name: "Other campaigns",
    });
    expect(rows.reduce((n, r) => n + r.spend, 0)).toBe(rollup([], spend).spend);
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

  it("sends an excluded ad's leads to the reconciling row, not nowhere", () => {
    // Meta's lead counts ride on the spend rows; the CRM leads supply the
    // bookings.
    const scoped = [adSpend("a1", 80, 3), adSpend("a2", 20, 0), adSpend("a9", 500, 5)];
    const rows = breakdown(
      [...leads(3, "a1", "booking"), ...leads(5, "a9", "booking")],
      scoped,
      "ad",
      null,
      ENTITIES,
    );
    expect(rows.find((r) => r.id === "a1")!.leads).toBe(3);
    expect(rows.find((r) => r.id === "a9")).toBeUndefined();
    // The leads travel with the spend that bought them, so the row's cost per
    // lead is a real figure rather than 500 divided by nothing.
    const other = rows.find((r) => r.id === OTHER_ID)!;
    expect(other).toMatchObject({ leads: 5, bookings: 5, spend: 500 });
    expect(other.costPerLead).toBe(100);
    // And the lead column reconciles with Results the way spend does.
    expect(rows.reduce((n, r) => n + r.leads, 0)).toBe(8);
    expect(rows.reduce((n, r) => n + r.leads, 0)).toBe(rollup([], scoped).leads);
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
