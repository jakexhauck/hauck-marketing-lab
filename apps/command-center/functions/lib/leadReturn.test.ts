import { describe, it, expect } from "vitest";
import {
  ALREADY_CALLED_REASON,
  MAX_PER_RETURN,
  planReturn,
  returnedLeadPatch,
  wentToTheDialer,
  type BookEntry,
  type ReturnCandidate,
} from "./leadReturn";

function lead(over: Partial<ReturnCandidate> = {}): ReturnCandidate {
  return {
    id: "lead-1",
    phoneE164: "+13135550101",
    businessName: "Ace Garage Doors",
    sendStatus: "cold_call_20260824_queued",
    sentTo: "cold_call",
    ...over,
  };
}

function entry(over: Partial<BookEntry> = {}): BookEntry {
  return {
    id: "book-1",
    phone: "+13135550101",
    ghlContactId: "ghl-1",
    dialed: false,
    ...over,
  };
}

function bookOf(...entries: BookEntry[]): Map<string, BookEntry> {
  return new Map(entries.map((e) => [e.phone, e]));
}

describe("wentToTheDialer", () => {
  it("accepts the stamp a cold call send writes", () => {
    expect(wentToTheDialer("cold_call_20260824_queued", "cold_call")).toBe(true);
  });

  it("accepts the already-in-book variant of that stamp", () => {
    expect(wentToTheDialer("cold_call_20260824_queued_already_in_book", "cold_call")).toBe(true);
  });

  it("refuses a lead that was never sent", () => {
    expect(wentToTheDialer("pending", null)).toBe(false);
  });

  it("refuses an SMS send, which never reaches the dialer", () => {
    expect(wentToTheDialer("sms_20260824_queued", "sms")).toBe(false);
  });

  it("refuses a do-not-contact row even though it is not pending", () => {
    expect(wentToTheDialer("do_not_contact", null)).toBe(false);
  });
});

describe("planReturn", () => {
  it("returns a queued company that nobody has rung", () => {
    const plan = planReturn([lead()], bookOf(entry()));
    expect(plan.rejected).toEqual([]);
    expect(plan.items).toEqual([
      { leadId: "lead-1", bookId: "book-1", ghlContactId: "ghl-1", businessName: "Ace Garage Doors" },
    ]);
  });

  it("refuses a company that has already been called", () => {
    const plan = planReturn([lead()], bookOf(entry({ dialed: true })));
    expect(plan.items).toEqual([]);
    expect(plan.rejected[0].reason).toBe(ALREADY_CALLED_REASON);
  });

  it("refuses a lead that never went to the dialer", () => {
    const plan = planReturn([lead({ sendStatus: "pending", sentTo: null })], bookOf(entry()));
    expect(plan.items).toEqual([]);
    expect(plan.rejected[0].reason).toBe("Not on the dialer list");
  });

  it("refuses a lead with no row in the call list", () => {
    const plan = planReturn([lead()], bookOf());
    expect(plan.items).toEqual([]);
    expect(plan.rejected[0].reason).toBe("Not in the call list");
  });

  // The one that would otherwise be dialled anyway AND offered to be sent again.
  it("refuses a company with no GoHighLevel contact rather than resetting it", () => {
    const plan = planReturn([lead()], bookOf(entry({ ghlContactId: null })));
    expect(plan.items).toEqual([]);
    expect(plan.rejected[0].reason).toContain("Not linked to GoHighLevel");
  });

  it("matches the book on the phone number, not on position", () => {
    const plan = planReturn(
      [lead({ id: "a", phoneE164: "+13135550101" }), lead({ id: "b", phoneE164: "+13135550202" })],
      bookOf(
        entry({ id: "book-b", phone: "+13135550202", ghlContactId: "ghl-b" }),
        entry({ id: "book-a", phone: "+13135550101", ghlContactId: "ghl-a" }),
      ),
    );
    expect(plan.items.map((i) => [i.leadId, i.bookId])).toEqual([
      ["a", "book-a"],
      ["b", "book-b"],
    ]);
  });

  it("keeps the good ones when one in the batch is refused", () => {
    const plan = planReturn(
      [lead({ id: "a" }), lead({ id: "b", phoneE164: "+13135550202" })],
      bookOf(
        entry({ id: "book-a" }),
        entry({ id: "book-b", phone: "+13135550202", ghlContactId: "ghl-b", dialed: true }),
      ),
    );
    expect(plan.items.map((i) => i.leadId)).toEqual(["a"]);
    expect(plan.rejected.map((r) => r.id)).toEqual(["b"]);
  });
});

describe("returnedLeadPatch", () => {
  it("puts the row back exactly as an unsent lead", () => {
    expect(returnedLeadPatch()).toEqual({ send_status: "pending", sent_to: null, sent_at: null });
  });
});

describe("MAX_PER_RETURN", () => {
  // Two GoHighLevel calls a company plus about six fixed, against a fifty call
  // ceiling. If this ever climbs past twenty-two the budget is blown.
  it("stays inside the outbound call budget", () => {
    expect(MAX_PER_RETURN * 2 + 6).toBeLessThanOrEqual(50);
  });
});
