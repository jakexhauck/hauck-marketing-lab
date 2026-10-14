import { describe, expect, it } from "vitest";
import type { GhlContactRecord, GhlOpportunity } from "../../lib/ghl";
import { computeSegments } from "./audiences";

const NOW = Date.parse("2026-07-03T00:00:00Z");
const DAYS = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

function contact(id: string, over: Partial<GhlContactRecord> = {}): GhlContactRecord {
  return { id, phone: "+15550000000", ...over };
}

function opp(contactId: string, over: Partial<GhlOpportunity> = {}): GhlOpportunity {
  return { id: `o-${contactId}-${Math.random()}`, contactId, status: "won", ...over };
}

function seg(segments: ReturnType<typeof computeSegments>, id: string): number {
  return segments.find((s) => s.id === id)?.count ?? -1;
}

describe("computeSegments", () => {
  it("counts only reachable contacts (phone or email) as All customers", () => {
    const contacts = [
      contact("a", { phone: "+1555", email: "" }),
      contact("b", { phone: "", email: "b@x.com" }),
      contact("c", { phone: "", email: "" }), // no way to reach — excluded
    ];
    const segments = computeSegments(contacts, [], NOW);
    expect(seg(segments, "all")).toBe(2);
  });

  it("flags customers added within 60 days as New", () => {
    const contacts = [
      contact("recent", { dateAdded: DAYS(10) }),
      contact("edge", { dateAdded: DAYS(59) }),
      contact("old", { dateAdded: DAYS(120) }),
    ];
    const segments = computeSegments(contacts, [], NOW);
    expect(seg(segments, "new")).toBe(2);
  });

  it("counts a contact with 3+ won jobs as Repeat / VIP", () => {
    const contacts = [contact("loyal"), contact("once")];
    const opps = [
      opp("loyal"),
      opp("loyal"),
      opp("loyal"),
      opp("once"),
      opp("loyal", { status: "open" }), // open does not count toward wins
    ];
    const segments = computeSegments(contacts, opps, NOW);
    expect(seg(segments, "vip")).toBe(1);
  });

  it("counts a contact whose last activity is over 12 months old as Past", () => {
    const contacts = [contact("dormant"), contact("active")];
    const opps = [
      opp("dormant", { lastStatusChangeAt: DAYS(400) }),
      opp("active", { lastStatusChangeAt: DAYS(30) }),
    ];
    const segments = computeSegments(contacts, opps, NOW);
    expect(seg(segments, "past")).toBe(1);
  });

  it("returns the four computable segments and no trade-specific ones", () => {
    const segments = computeSegments([contact("a")], [], NOW);
    expect(segments.map((s) => s.id)).toEqual(["all", "past", "vip", "new"]);
  });
});
