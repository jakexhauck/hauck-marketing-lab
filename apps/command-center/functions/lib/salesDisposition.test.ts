import { describe, expect, it } from "vitest";
import {
  DISPOSITION_STATUSES,
  buildDispositionUpdate,
  parseMoney,
  statusFromOutcome,
} from "./salesDisposition";

// The post-call form's answers decide real money and real close rates, so
// every branch of the mapping is pinned.

const blank = {
  status: "",
  cashCollected: "",
  revenueGenerated: "",
  paymentPlatform: "",
  recordingLink: "",
  notes: "",
};

function ok(input: Partial<typeof blank>) {
  const result = buildDispositionUpdate({ ...blank, ...input });
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result.update;
}

function err(input: Partial<typeof blank>) {
  const result = buildDispositionUpdate({ ...blank, ...input });
  if (result.ok) throw new Error("expected an error");
  return result.error;
}

describe("DISPOSITION_STATUSES", () => {
  it("offers the seven answers the GHL form offered, in its order", () => {
    expect(DISPOSITION_STATUSES.map((s) => s.label)).toEqual([
      "PIF",
      "Deposit",
      "No-Close",
      "No-Show",
      "Follow Up",
      "Unqualified",
      "Cancelled",
    ]);
  });
});

describe("buildDispositionUpdate: status", () => {
  it("maps every status onto an outcome", () => {
    expect(ok({ status: "pif" }).outcome).toBe("closed");
    expect(ok({ status: "deposit" }).outcome).toBe("closed");
    expect(ok({ status: "noclose" }).outcome).toBe("not_interested");
    expect(ok({ status: "noshow" }).outcome).toBe("no_show");
    expect(ok({ status: "followup" }).outcome).toBe("follow_up");
    expect(ok({ status: "unqualified" }).outcome).toBe("not_qualified");
  });

  it("keeps PIF and Deposit apart in disposition_status", () => {
    expect(ok({ status: "pif" }).disposition_status).toBe("pif");
    expect(ok({ status: "deposit" }).disposition_status).toBe("deposit");
  });

  it("Cancelled clears the outcome rather than inventing one", () => {
    const update = ok({ status: "cancelled" });
    expect(update.outcome).toBeNull();
    expect(update.disposition_status).toBe("cancelled");
  });

  it("Unqualified marks the prospect unqualified; a pitch marks them qualified", () => {
    expect(ok({ status: "unqualified" }).qualified).toBe(false);
    expect(ok({ status: "pif" }).qualified).toBe(true);
    expect(ok({ status: "noclose" }).qualified).toBe(true);
    expect(ok({ status: "noshow" }).qualified).toBeNull();
  });

  it("refuses a save with no status", () => {
    expect(err({ status: "" })).toMatch(/status/i);
  });

  it("refuses a status the form does not offer", () => {
    expect(err({ status: "maybe" })).toMatch(/status/i);
  });
});

describe("buildDispositionUpdate: the other fields", () => {
  it("writes money as numbers and blank money as null", () => {
    const update = ok({ status: "pif", cashCollected: "$1,500", revenueGenerated: "" });
    expect(update.cash_collected).toBe(1500);
    expect(update.revenue_generated).toBeNull();
  });

  it("refuses money that is not a number, rather than dropping it quietly", () => {
    expect(err({ status: "pif", cashCollected: "lots" })).toMatch(/cash/i);
    expect(err({ status: "pif", revenueGenerated: "-5" })).toMatch(/revenue/i);
  });

  it("replaces the text fields, so a mistake can be corrected", () => {
    const update = ok({
      status: "noclose",
      paymentPlatform: "  Stripe ",
      recordingLink: "https://fathom.video/x",
      notes: "  Too busy until spring  ",
    });
    expect(update.payment_platform).toBe("Stripe");
    expect(update.recording_link).toBe("https://fathom.video/x");
    expect(update.scratchpad).toBe("Too busy until spring");
  });

  it("blank text fields write empty strings, never null", () => {
    const update = ok({ status: "noshow" });
    expect(update.payment_platform).toBe("");
    expect(update.recording_link).toBe("");
    expect(update.scratchpad).toBe("");
  });

  it("refuses a recording that is not a web link", () => {
    expect(err({ status: "pif", recordingLink: "javascript:alert(1)" })).toMatch(/recording/i);
    expect(err({ status: "pif", recordingLink: "my zoom" })).toMatch(/recording/i);
  });

  it("caps the notes", () => {
    expect(ok({ status: "pif", notes: "x".repeat(5000) }).scratchpad).toHaveLength(4000);
  });
});

describe("parseMoney", () => {
  it("reads what a person types", () => {
    expect(parseMoney("$1,200")).toBe(1200);
    expect(parseMoney("1200.50")).toBe(1200.5);
    expect(parseMoney(" 2,000 ")).toBe(2000);
    expect(parseMoney(900)).toBe(900);
  });

  it("returns null for blank and nonsense", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("-5")).toBeNull();
  });
});

describe("statusFromOutcome", () => {
  it("prefills the form for a meeting recorded before the form existed", () => {
    expect(statusFromOutcome("closed")).toBe("pif");
    expect(statusFromOutcome("not_interested")).toBe("noclose");
    expect(statusFromOutcome("no_show")).toBe("noshow");
    expect(statusFromOutcome("follow_up")).toBe("followup");
    expect(statusFromOutcome("not_qualified")).toBe("unqualified");
    expect(statusFromOutcome(null)).toBe("");
    expect(statusFromOutcome("rubbish")).toBe("");
  });
});
