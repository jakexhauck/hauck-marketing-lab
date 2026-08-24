import { describe, expect, it } from "vitest";
import {
  buildDispositionPatch,
  isAllowedFormUrl,
  parseMoney,
  parseStatus,
  patchIsEmpty,
  pickTargetCall,
  type TargetableCall,
} from "./salesDisposition";

// The GHL disposition form's answers decide real money and real close rates,
// so every branch of the mapping is pinned. The radio strings are the live
// form's exact values; anything else must parse as unknown.

describe("parseStatus", () => {
  it("maps every radio value on the live form", () => {
    expect(parseStatus("PIF")).toEqual({ outcome: "closed", cancelAppointment: false });
    expect(parseStatus("Deposit")).toEqual({ outcome: "closed", cancelAppointment: false });
    expect(parseStatus("No-Close")).toEqual({ outcome: "not_interested", cancelAppointment: false });
    expect(parseStatus("No-Show")).toEqual({ outcome: "no_show", cancelAppointment: false });
    expect(parseStatus("Follow Up")).toEqual({ outcome: "follow_up", cancelAppointment: false });
    expect(parseStatus("Unqualified")).toEqual({
      outcome: "not_qualified",
      qualified: false,
      cancelAppointment: false,
    });
  });

  it("tolerates case, spaces and punctuation", () => {
    expect(parseStatus("pif")?.outcome).toBe("closed");
    expect(parseStatus("  follow up ")?.outcome).toBe("follow_up");
    expect(parseStatus("NO-SHOW")?.outcome).toBe("no_show");
  });

  it("sends Cancelled to the calendar, not to an outcome", () => {
    // The outcome check constraint has no cancelled value; cancellation lives
    // on appointment_status, which the sheet reads separately.
    expect(parseStatus("Cancelled")).toEqual({ outcome: null, cancelAppointment: true });
  });

  it("refuses blank and unknown rather than guessing", () => {
    expect(parseStatus("")).toBeNull();
    expect(parseStatus(null)).toBeNull();
    expect(parseStatus(42)).toBeNull();
    expect(parseStatus("maybe")).toBeNull();
  });
});

describe("parseMoney", () => {
  it("takes what a browser form actually sends", () => {
    expect(parseMoney("$1,200")).toBe(1200);
    expect(parseMoney("1200.50")).toBe(1200.5);
    expect(parseMoney(" 2,000 ")).toBe(2000);
    expect(parseMoney("0")).toBe(0);
  });

  it("calls a blank answer unanswered, never zero", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("   ")).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
    // A silent zero would claim the deal was free; null renders as a dash.
    expect(parseMoney("n/a")).toBeNull();
    expect(parseMoney("-500")).toBeNull();
  });
});

describe("isAllowedFormUrl", () => {
  const REAL = "https://link.hauckmarketing.com/widget/form/RaoIfnclY5sytH5ndisi?phone=%2B17343010570";

  it("accepts the agency's own widget URLs", () => {
    expect(isAllowedFormUrl(REAL)).toBe(true);
  });

  it("rejects foreign hosts, bare paths and non-strings", () => {
    expect(isAllowedFormUrl("https://evil.example/widget/form/abc")).toBe(false);
    expect(isAllowedFormUrl("/widget/form/RaoIfnclY5sytH5ndisi")).toBe(false);
    expect(isAllowedFormUrl("http://link.hauckmarketing.com/widget/form/abc")).toBe(false);
    expect(isAllowedFormUrl("")).toBe(false);
    expect(isAllowedFormUrl(undefined)).toBe(false);
  });
});

function call(over: Partial<TargetableCall>): TargetableCall {
  return {
    id: "row",
    ghl_contact_id: "contact-1",
    phone: "+17343010570",
    outcome: null,
    scheduled_at: "2026-08-24T15:00:00Z",
    ...over,
  };
}

describe("pickTargetCall", () => {
  it("matches by contact id first", () => {
    const rows = [
      call({ id: "a", ghl_contact_id: "someone-else" }),
      call({ id: "b" }),
    ];
    expect(pickTargetCall(rows, "contact-1", null)?.id).toBe("b");
  });

  it("falls back to normalised phone when no contact id matches", () => {
    const rows = [call({ id: "a", phone: "(734) 301-0570" })];
    expect(pickTargetCall(rows, null, "+1 734.301.0570")?.id).toBe("a");
  });

  it("skips recorded rows entirely", () => {
    // A retry or double submission finds the row already stamped and no-ops;
    // it must never overwrite an outcome somebody already recorded.
    const rows = [
      call({ id: "old", outcome: "closed", scheduled_at: "2026-08-20T15:00:00Z" }),
      call({ id: "newest", outcome: "not_interested" }),
    ];
    expect(pickTargetCall(rows, "contact-1", null)).toBeNull();
  });

  it("prefers the most recent open meeting", () => {
    const rows = [
      call({ id: "older", scheduled_at: "2026-08-10T15:00:00Z" }),
      call({ id: "newer", scheduled_at: "2026-08-24T15:00:00Z" }),
      call({ id: "recorded", outcome: "closed", scheduled_at: "2026-08-25T15:00:00Z" }),
    ];
    expect(pickTargetCall(rows, "contact-1", null)?.id).toBe("newer");
  });

  it("returns nothing when the prospect owns no meeting", () => {
    expect(pickTargetCall([call({ id: "a" })], "other-contact", null)).toBeNull();
    expect(pickTargetCall([], null, null)).toBeNull();
  });
});

describe("buildDispositionPatch", () => {
  it("stamps a full closed call", () => {
    const patch = buildDispositionPatch({
      status: "PIF",
      cashCollected: "$1,500",
      revenueGenerated: "6000",
      paymentPlatform: "Stripe",
      recordingLink: "https://drive.example/rec/1",
      feedback: "Wants onboarding next week.",
    });
    expect(patch.outcome).toBe("closed");
    expect(patch.cash_collected).toBe(1500);
    expect(patch.revenue_generated).toBe(6000);
    expect(patch.payment_platform).toBe("Stripe");
    expect(patch.recording_link).toBe("https://drive.example/rec/1");
    expect(patch.feedback).toBe("Wants onboarding next week.");
    expect(patch.appointment_status).toBeUndefined();
    expect(patch.qualified).toBeUndefined();
  });

  it("marks unqualified and cancels without inventing outcomes", () => {
    expect(buildDispositionPatch({ status: "Unqualified", cashCollected: "", revenueGenerated: "", paymentPlatform: "", recordingLink: "", feedback: "" })).toMatchObject({
      outcome: "not_qualified",
      qualified: false,
    });
    expect(buildDispositionPatch({ status: "Cancelled", cashCollected: "", revenueGenerated: "", paymentPlatform: "", recordingLink: "", feedback: "" })).toMatchObject({
      appointment_status: "cancelled",
    });
    expect(
      buildDispositionPatch({ status: "Cancelled", cashCollected: "", revenueGenerated: "", paymentPlatform: "", recordingLink: "", feedback: "" }).outcome,
    ).toBeUndefined();
  });

  it("stamps free text while leaving the row Awaiting on an unknown status", () => {
    // A partial or unexpected submission fills what it can and never guesses
    // the radio.
    const patch = buildDispositionPatch({
      status: "maybe",
      cashCollected: "",
      revenueGenerated: "",
      paymentPlatform: "Cash",
      recordingLink: "",
      feedback: "Rang back, will reschedule.",
    });
    expect(patch.outcome).toBeUndefined();
    expect(patch.payment_platform).toBe("Cash");
    expect(patch.feedback).toBe("Rang back, will reschedule.");
  });

  it("never writes empties over stored values", () => {
    const patch = buildDispositionPatch({
      status: "",
      cashCollected: "",
      revenueGenerated: "",
      paymentPlatform: "   ",
      recordingLink: undefined,
      feedback: "",
    });
    expect(patch.cash_collected).toBeUndefined();
    expect(patch.revenue_generated).toBeUndefined();
    expect(patch.payment_platform).toBeUndefined();
    expect(patch.recording_link).toBeUndefined();
    expect(patchIsEmpty(patch)).toBe(true);
  });
});
