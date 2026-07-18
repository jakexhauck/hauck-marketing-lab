import { describe, it, expect } from "vitest";
import {
  buildBillingUpdate,
  emptyBillingDto,
  toBillingDto,
  isBillingStatus,
  type BillingRow,
} from "./clientBilling";

function ok(result: ReturnType<typeof buildBillingUpdate>) {
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result.update;
}

describe("buildBillingUpdate", () => {
  it("maps camelCase text fields onto their snake_case columns", () => {
    const update = ok(
      buildBillingUpdate({
        source: "Cold Call",
        dateClosed: "Jun 12, 2026",
        paymentArrangement: "3k for 6 months",
        lastTouchpoint: "Jul 14, 2026",
      }),
    );
    expect(update).toEqual({
      source: "Cold Call",
      date_closed: "Jun 12, 2026",
      payment_arrangement: "3k for 6 months",
      last_touchpoint: "Jul 14, 2026",
    });
  });

  it("trims text values", () => {
    expect(ok(buildBillingUpdate({ notes: "  pays late  " }))).toEqual({
      notes: "pays late",
    });
  });

  it("treats an empty string as a clear, not a skip", () => {
    expect(ok(buildBillingUpdate({ churnDate: "" }))).toEqual({ churn_date: "" });
  });

  it("only touches the fields supplied", () => {
    const update = ok(buildBillingUpdate({ source: "Referral" }));
    expect(Object.keys(update)).toEqual(["source"]);
  });

  it("drops unknown keys rather than writing them", () => {
    const update = ok(buildBillingUpdate({ source: "Referral", tenant_id: "spoofed", id: 7 }));
    expect(update).toEqual({ source: "Referral" });
  });

  it("rounds cash to whole dollars", () => {
    expect(ok(buildBillingUpdate({ upfrontCash: 1999.6 }))).toEqual({ upfront_cash: 2000 });
  });

  it("accepts zero cash", () => {
    expect(ok(buildBillingUpdate({ remainingCash: 0 }))).toEqual({ remaining_cash: 0 });
  });

  it("rejects negative cash", () => {
    const result = buildBillingUpdate({ upfrontCash: -1 });
    expect(result.ok).toBe(false);
  });

  it("rejects non-numeric cash", () => {
    expect(buildBillingUpdate({ totalCashCollected: "lots" }).ok).toBe(false);
    expect(buildBillingUpdate({ totalCashCollected: Infinity }).ok).toBe(false);
  });

  it("accepts the two valid statuses", () => {
    expect(ok(buildBillingUpdate({ status: "active" }))).toEqual({ status: "active" });
    expect(ok(buildBillingUpdate({ status: "churned" }))).toEqual({ status: "churned" });
  });

  it("rejects a status outside the enum", () => {
    const result = buildBillingUpdate({ status: "paused" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid status");
  });

  it("rejects a body with nothing valid in it", () => {
    const result = buildBillingUpdate({ nonsense: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("no fields to update");
  });

  it("rejects a non-object body", () => {
    expect(buildBillingUpdate(null).ok).toBe(false);
    expect(buildBillingUpdate("nope").ok).toBe(false);
  });
});

describe("emptyBillingDto", () => {
  it("is blank and active, never fabricated numbers", () => {
    const dto = emptyBillingDto();
    expect(dto.source).toBe("");
    expect(dto.upfrontCash).toBe(0);
    expect(dto.status).toBe("active");
    expect(dto.updatedAt).toBeNull();
  });
});

describe("toBillingDto", () => {
  const row: BillingRow = {
    source: "Cold Call",
    date_closed: "Jun 12, 2026",
    service: "Facebook ads",
    payment_arrangement: "3k for 6 months",
    upfront_cash: 2000,
    remaining_cash: 1000,
    total_cash_collected: 2000,
    billing_date: "Jul 22, 2026",
    renewal_date: "Dec 12, 2026",
    last_touchpoint: "Jul 14, 2026",
    churn_date: "",
    status: "active",
    notes: "renewal call in Dec",
    updated_at: "2026-07-17T10:00:00Z",
  };

  it("camelCases the row", () => {
    const dto = toBillingDto(row);
    expect(dto.dateClosed).toBe("Jun 12, 2026");
    expect(dto.paymentArrangement).toBe("3k for 6 months");
    expect(dto.totalCashCollected).toBe(2000);
    expect(dto.updatedAt).toBe("2026-07-17T10:00:00Z");
  });

  it("falls back to active for a status the enum does not know", () => {
    expect(toBillingDto({ ...row, status: "weird" }).status).toBe("active");
  });
});

describe("isBillingStatus", () => {
  it("accepts the enum and rejects everything else", () => {
    expect(isBillingStatus("active")).toBe(true);
    expect(isBillingStatus("churned")).toBe(true);
    expect(isBillingStatus("paused")).toBe(false);
    expect(isBillingStatus(null)).toBe(false);
  });
});
