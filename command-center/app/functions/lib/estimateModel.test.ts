import { describe, expect, it } from "vitest";
import { estimateLevel, rollup, withPickups, type TrackerLead, type TrackerSpendRow } from "./adTrackerMetrics";
import { ownerLinkValues } from "./ghlProvision";

const spend = (date: string, leads: number, amount: number): TrackerSpendRow => ({
  date,
  adId: "ad1",
  adName: "Ad",
  adsetId: "as1",
  adsetName: "Set",
  campaignId: "c1",
  campaignName: "Camp",
  spend: amount,
  impressions: 0,
  reach: 0,
  linkClicks: 0,
  leads,
  metaBookings: 0,
});

const lead = (id: string, level: TrackerLead["level"], value = 0): TrackerLead => ({
  contactId: id,
  createdAt: "2026-10-02T15:00:00Z",
  level,
  status: "new",
  value,
  adId: "ad1",
});

describe("estimate model", () => {
  it("a job beats an estimate, and the stage is never read", () => {
    expect(estimateLevel(true, false)).toBe("sale");
    expect(estimateLevel(false, true)).toBe("booking");
    expect(estimateLevel(false, false)).toBe("lead");
  });

  it("works the agreed numbers: Pickup % over called, Estimate % over leads, three costs", () => {
    const leads = [lead("a", "sale", 4000), lead("b", "booking"), lead("c", "booking"), lead("d", "lead")];
    const k = withPickups(rollup(leads, [spend("2026-10-02", 10, 1000)]), {
      called: 4,
      pickups: 3,
      notCalled: 6,
    });
    expect(k.leads).toBe(10);
    expect(k.pickups).toBe(3);
    expect(k.pickupRate).toBe(0.75);
    expect(k.bookings).toBe(3);
    expect(k.bookingRate).toBe(0.3);
    expect(k.sales).toBe(1);
    expect(k.revenue).toBe(4000);
    expect(k.costPerLead).toBe(100);
    expect(k.costPerBooking).toBeCloseTo(333.33, 2);
    expect(k.costPerSale).toBe(1000);
    expect(k.notCalled).toBe(6);
  });

  it("nobody called yet is a dash, not 0%", () => {
    expect(withPickups(rollup([], []), { called: 0, pickups: 0, notCalled: 0 }).pickupRate).toBeNull();
  });
});

describe("ownerLinkValues", () => {
  it("puts the key in the link and never a localhost origin", async () => {
    const live = await ownerLinkValues("http://localhost:8788", "s3cret", "yVfX127fswQ03fydxBQg");
    expect(live.map((v) => v.name)).toEqual(["Call Now Link", "Estimate Outcome Link"]);
    expect(live[0].value).toMatch(
      /^https:\/\/app\.hauckmarketing\.com\/api\/call-now\?l=yVfX127fswQ03fydxBQg&k=[0-9a-f]{32}$/,
    );
    expect(live[1].value).toMatch(/\/api\/estimate-outcome\?l=yVfX127fswQ03fydxBQg&k=[0-9a-f]{32}$/);
    expect(live[0].value.split("k=")[1]).not.toBe(live[1].value.split("k=")[1]);
  });
});
