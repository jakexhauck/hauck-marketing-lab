import { describe, expect, it } from "vitest";
import { selfDialStats, sortNewestFirst } from "./selfDialLeads";
import type { LeadTrackerLead } from "./api";

function lead(over: Partial<LeadTrackerLead>): LeadTrackerLead {
  return {
    contactId: "c",
    opportunityId: null,
    name: "A",
    email: "",
    phone: "",
    createdAt: "2026-09-01T00:00:00Z",
    status: "new",
    when: null,
    value: null,
    ...over,
  } as LeadTrackerLead;
}

describe("sortNewestFirst", () => {
  it("puts the latest submission on top without mutating the input", () => {
    const input = [
      lead({ contactId: "old", createdAt: "2026-09-01T00:00:00Z" }),
      lead({ contactId: "new", createdAt: "2026-09-20T00:00:00Z" }),
    ];
    expect(sortNewestFirst(input).map((l) => l.contactId)).toEqual(["new", "old"]);
    expect(input[0].contactId).toBe("old");
  });
});

describe("selfDialStats", () => {
  it("counts leads, untouched ones, and won jobs with their value", () => {
    const stats = selfDialStats([
      lead({ status: "new" }),
      lead({ status: "no_answer" }),
      lead({ status: "won", value: 450 }),
      lead({ status: "won", value: null }),
    ]);
    expect(stats).toEqual({ total: 4, untouched: 1, won: 2, revenue: 450 });
  });
});
