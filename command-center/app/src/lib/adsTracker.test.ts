import { describe, it, expect } from "vitest";
import {
  computeFunnel,
  computeAdBreakdown,
  totalSpend,
  type AdsClientData,
  type AdsLead,
} from "./adsTracker";

// A minimal lead factory: only the fields the math reads matter here.
function lead(partial: Partial<AdsLead>): AdsLead {
  return {
    date: "2026-03-21",
    name: "Test",
    email: "",
    number: "",
    info: "",
    status: "New Lead",
    value: null,
    notes: "",
    campaignName: "C",
    campaignId: "1",
    adSetName: "S",
    adSetId: "2",
    adName: "Ad A",
    adId: "ad-a",
    ghlContact: "",
    ...partial,
  };
}

const fixture: AdsClientData = {
  clientId: "c1",
  clientName: "Test Co",
  adAccountId: "acc1",
  leads: [
    lead({ status: "New Lead", adId: "ad-a" }),
    lead({ status: "No Contact", adId: "ad-a" }),
    lead({ status: "Call Again", adId: "ad-a" }), // pickup, not booking
    lead({ status: "Booked", adId: "ad-b" }), // pickup + booking
    lead({ status: "Sold", value: 1000, adId: "ad-b" }), // pickup + booking + sale
  ],
  ads: [
    { adName: "Ad A", adId: "ad-a", spend: 50 },
    { adName: "Ad B", adId: "ad-b", spend: 150 },
  ],
  metaRows: [
    { date: "2026-03-21", spend: 120, impressions: 1000, reach: 800, linkClicks: 20, ctr: 2, day: "Sat", cpm: 10, campaignName: "C", campaignId: "1", adSetName: "S", adSetId: "2", adName: "Ad A", adId: "ad-a" },
    { date: "2026-03-22", spend: 80, impressions: 600, reach: 500, linkClicks: 12, ctr: 2, day: "Sun", cpm: 10, campaignName: "C", campaignId: "1", adSetName: "S", adSetId: "2", adName: "Ad B", adId: "ad-b" },
  ],
};

describe("computeFunnel", () => {
  const f = computeFunnel(fixture);

  it("counts leads, pickups, bookings, sales by the sheet's rules", () => {
    expect(f.leads).toBe(5);
    expect(f.pickups).toBe(3); // anything past New Lead / No Contact
    expect(f.bookings).toBe(2); // Booked + Sold + Lost
    expect(f.sales).toBe(1); // Sold only
  });

  it("sums revenue from Sold leads and ad spend from meta rows", () => {
    expect(f.revenue).toBe(1000);
    expect(f.adSpend).toBe(200);
    expect(f.roas).toBeCloseTo(5); // 1000 / 200
  });

  it("derives the rates", () => {
    expect(f.pickupRate).toBeCloseTo(0.6); // 3/5
    expect(f.bookingRate).toBeCloseTo(0.4); // 2/5
    expect(f.salesPctOfLeads).toBeCloseTo(0.2); // 1/5
    expect(f.closeRate).toBeCloseTo(0.5); // 1/2
  });
});

describe("computeAdBreakdown", () => {
  const rows = computeAdBreakdown(fixture);

  it("attributes leads, bookings, sales, revenue to each ad", () => {
    const a = rows.find((r) => r.adId === "ad-a")!;
    const b = rows.find((r) => r.adId === "ad-b")!;
    expect(a.leads).toBe(3);
    expect(a.bookings).toBe(0);
    expect(a.sales).toBe(0);
    expect(a.revenue).toBe(0);
    expect(b.leads).toBe(2);
    expect(b.bookings).toBe(2);
    expect(b.sales).toBe(1);
    expect(b.revenue).toBe(1000);
  });

  it("computes spend efficiency and roas per ad", () => {
    const a = rows.find((r) => r.adId === "ad-a")!;
    const b = rows.find((r) => r.adId === "ad-b")!;
    expect(a.costPerLead).toBeCloseTo(50 / 3);
    expect(a.roas).toBe(0); // no revenue
    expect(b.roas).toBeCloseTo(1000 / 150);
    expect(b.costPerBooking).toBeCloseTo(150 / 2);
  });
});

describe("divide-by-zero guards", () => {
  const empty: AdsClientData = {
    clientId: "e",
    clientName: "Empty",
    adAccountId: "acc",
    leads: [],
    ads: [],
    metaRows: [],
  };
  const f = computeFunnel(empty);

  it("returns 0 rates and no NaN/Infinity when there is no data", () => {
    for (const v of Object.values(f)) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(f.leads).toBe(0);
    expect(f.roas).toBe(0);
    expect(f.pickupRate).toBe(0);
    expect(f.closeRate).toBe(0);
  });
});

describe("totalSpend", () => {
  it("sums meta row spend", () => {
    expect(totalSpend(fixture.metaRows)).toBe(200);
  });
});
