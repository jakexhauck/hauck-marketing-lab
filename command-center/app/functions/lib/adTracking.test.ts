import { describe, it, expect } from "vitest";
import {
  buildAdTrackingUpsert,
  currentMonth,
  isIsoDate,
  monthRange,
  toAdTrackingDto,
} from "./adTracking";

describe("monthRange", () => {
  it("covers a month as a half-open range", () => {
    expect(monthRange("2026-07")).toEqual({
      start: "2026-07-01",
      nextStart: "2026-08-01",
    });
  });

  it("rolls the year over in December", () => {
    expect(monthRange("2026-12")).toEqual({
      start: "2026-12-01",
      nextStart: "2027-01-01",
    });
  });

  it("handles February without special-casing leap years", () => {
    // Half-open, so the range is correct whether February has 28 or 29 days.
    expect(monthRange("2028-02")).toEqual({
      start: "2028-02-01",
      nextStart: "2028-03-01",
    });
  });

  it("rejects a malformed or impossible month", () => {
    expect(monthRange("2026-7")).toBeNull();
    expect(monthRange("2026-13")).toBeNull();
    expect(monthRange("2026-00")).toBeNull();
    expect(monthRange("nope")).toBeNull();
    expect(monthRange("")).toBeNull();
  });
});

describe("currentMonth", () => {
  it("reads the UTC month, zero padded", () => {
    expect(currentMonth(new Date("2026-07-17T00:00:00Z"))).toBe("2026-07");
    expect(currentMonth(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
  });
});

describe("isIsoDate", () => {
  it("accepts a real calendar day", () => {
    expect(isIsoDate("2026-07-17")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true); // leap year
  });

  it("rejects a day that does not exist", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2027-02-29")).toBe(false); // not a leap year
  });

  it("rejects the wrong shape", () => {
    expect(isIsoDate("2026-7-1")).toBe(false);
    expect(isIsoDate("Jul 17, 2026")).toBe(false);
    expect(isIsoDate(20260717)).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });
});

describe("buildAdTrackingUpsert", () => {
  function ok(result: ReturnType<typeof buildAdTrackingUpsert>) {
    if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
    return result.row;
  }

  it("requires a valid date", () => {
    expect(buildAdTrackingUpsert({ spend: 100 }).ok).toBe(false);
    expect(buildAdTrackingUpsert({ date: "nope", spend: 100 }).ok).toBe(false);
    expect(buildAdTrackingUpsert({ date: "2026-02-30" }).ok).toBe(false);
  });

  it("maps camelCase metrics onto their snake_case columns", () => {
    const row = ok(
      buildAdTrackingUpsert({
        date: "2026-07-17",
        spend: 100,
        linkClicks: 121,
        newLeads: 7,
        demosBooked: 3,
        contractedRev: 1200,
        ufCash: 600,
        newMrr: 90,
        noShow: 1,
      }),
    );
    expect(row).toEqual({
      date: "2026-07-17",
      spend: 100,
      link_clicks: 121,
      new_leads: 7,
      demos_booked: 3,
      contracted_rev: 1200,
      uf_cash: 600,
      new_mrr: 90,
      no_show: 1,
    });
  });

  it("accepts a date on its own (an upsert that only stamps the day)", () => {
    expect(ok(buildAdTrackingUpsert({ date: "2026-07-17" }))).toEqual({
      date: "2026-07-17",
    });
  });

  it("drops unknown keys rather than writing them", () => {
    const row = ok(
      buildAdTrackingUpsert({ date: "2026-07-17", spend: 10, tenant_id: "spoofed", id: 3 }),
    );
    expect(row).toEqual({ date: "2026-07-17", spend: 10 });
  });

  it("skips cleared cells so they keep their stored value", () => {
    const row = ok(
      buildAdTrackingUpsert({ date: "2026-07-17", spend: 10, clicks: "", newLeads: null }),
    );
    expect(row).toEqual({ date: "2026-07-17", spend: 10 });
  });

  it("clamps negatives to zero", () => {
    const row = ok(buildAdTrackingUpsert({ date: "2026-07-17", spend: -50, sales: -2 }));
    expect(row.spend).toBe(0);
    expect(row.sales).toBe(0);
  });

  it("keeps cents on money fields", () => {
    const row = ok(buildAdTrackingUpsert({ date: "2026-07-17", spend: 99.99 }));
    expect(row.spend).toBe(99.99);
  });

  it("accepts numeric strings from the form", () => {
    const row = ok(buildAdTrackingUpsert({ date: "2026-07-17", spend: "120.50" }));
    expect(row.spend).toBe(120.5);
  });

  it("rejects a non-numeric metric rather than silently zeroing it", () => {
    const result = buildAdTrackingUpsert({ date: "2026-07-17", spend: "lots" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("spend must be a number");
  });

  it("rejects a non-object body", () => {
    expect(buildAdTrackingUpsert(null).ok).toBe(false);
    expect(buildAdTrackingUpsert("nope").ok).toBe(false);
  });
});

describe("toAdTrackingDto", () => {
  it("camelCases the row and coerces PostgREST numeric strings", () => {
    const dto = toAdTrackingDto({
      date: "2026-07-17",
      spend: "100.00",
      impressions: 9200,
      clicks: 158,
      link_clicks: 121,
      new_leads: 7,
      demos_booked: 3,
      qualified: 2,
      disqualified: 1,
      no_show: 0,
      sales: 1,
      contracted_rev: "1200.00",
      uf_cash: "600.00",
      new_mrr: "0.00",
    });
    expect(dto.spend).toBe(100);
    expect(dto.linkClicks).toBe(121);
    expect(dto.contractedRev).toBe(1200);
    expect(dto.newMrr).toBe(0);
  });

  it("defaults missing values to zero rather than NaN", () => {
    const dto = toAdTrackingDto({ date: "2026-07-17" });
    expect(dto.spend).toBe(0);
    expect(dto.sales).toBe(0);
    expect(Number.isNaN(dto.impressions)).toBe(false);
  });
});
