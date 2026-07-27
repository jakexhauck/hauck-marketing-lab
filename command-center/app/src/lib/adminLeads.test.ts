import { describe, it, expect } from "vitest";
import type { AdminLead, AdminLeadStatus } from "./api";
import {
  LEAD_STATUSES,
  STATUS_META,
  metaFor,
  countByStatus,
  totalCount,
  filterByStatus,
  sortLeads,
  blankLeadDraft,
  todayIso,
  type LeadFilter,
} from "./adminLeads";

// A minimal lead with only the fields a given assertion cares about set.
function lead(over: Partial<AdminLead> & { id: string }): AdminLead {
  return {
    firstName: "",
    lastName: "",
    phone: "",
    timezone: "",
    status: "New Lead",
    firstContactDate: null,
    source: "",
    appointmentDate: null,
    noAnswer: 0,
    lastContact: null,
    followUpDate: null,
    email: "",
    notes: "",
    businessName: "",
    niche: "",
    website: "",
    city: "",
    state: "",
    assignedTo: null,
    createdAt: "2026-07-17T00:00:00.000Z",
    // Nothing has been pushed to GoHighLevel for a lead in a unit test.
    ghlContactId: null,
    ghlSyncedAt: null,
    ghlError: null,
    ...over,
  };
}

const mixed: AdminLead[] = [
  lead({ id: "1", status: "New Lead" }),
  lead({ id: "2", status: "New Lead" }),
  lead({ id: "3", status: "Call Back" }),
  lead({ id: "4", status: "1st Dial (Day 1)" }),
  lead({ id: "5", status: "Booked" }),
  lead({ id: "6", status: "Not Interested" }),
];

describe("countByStatus / totalCount", () => {
  it("counts each status across a mixed list", () => {
    const counts = countByStatus(mixed);
    expect(counts["New Lead"]).toBe(2);
    expect(counts["Call Back"]).toBe(1);
    expect(counts["1st Dial (Day 1)"]).toBe(1);
    expect(counts.Booked).toBe(1);
    expect(counts["2nd Dial (Day 2)"]).toBe(0);
    expect(counts["Not Interested"]).toBe(1);
    expect(totalCount(mixed)).toBe(6);
  });

  it("returns every status at zero for an empty list", () => {
    const counts = countByStatus([]);
    for (const status of LEAD_STATUSES) expect(counts[status]).toBe(0);
    expect(totalCount([])).toBe(0);
  });
});

describe("filterByStatus", () => {
  it("returns everything for All", () => {
    expect(filterByStatus(mixed, "All")).toHaveLength(6);
  });

  it("returns only the rows with that status", () => {
    const rows = filterByStatus(mixed, "New Lead");
    expect(rows.map((l) => l.id)).toEqual(["1", "2"]);
  });

  it("returns nothing for an unknown status", () => {
    expect(filterByStatus(mixed, "Nonexistent" as LeadFilter)).toEqual([]);
  });

  it("does not mutate the input list", () => {
    const input = mixed.slice();
    filterByStatus(input, "All");
    expect(input).toHaveLength(6);
  });
});

describe("sortLeads", () => {
  const byName: AdminLead[] = [
    lead({ id: "b", firstName: "Marcus" }),
    lead({ id: "a", firstName: "Danielle" }),
    lead({ id: "c", firstName: "Terrence" }),
  ];

  it("sorts text ascending and descending", () => {
    expect(sortLeads(byName, "firstName", "asc").map((l) => l.id)).toEqual(["a", "b", "c"]);
    expect(sortLeads(byName, "firstName", "desc").map((l) => l.id)).toEqual(["c", "b", "a"]);
  });

  it("sorts noAnswer numerically, not as text", () => {
    const rows = [
      lead({ id: "x", noAnswer: 10 }),
      lead({ id: "y", noAnswer: 2 }),
      lead({ id: "z", noAnswer: 0 }),
    ];
    expect(sortLeads(rows, "noAnswer", "asc").map((l) => l.id)).toEqual(["z", "y", "x"]);
    expect(sortLeads(rows, "noAnswer", "desc").map((l) => l.id)).toEqual(["x", "y", "z"]);
  });

  it("sorts dates by ISO order and keeps blanks last in both directions", () => {
    const rows = [
      lead({ id: "late", followUpDate: "2026-07-22" }),
      lead({ id: "none", followUpDate: null }),
      lead({ id: "early", followUpDate: "2026-07-02" }),
    ];
    expect(sortLeads(rows, "followUpDate", "asc").map((l) => l.id)).toEqual([
      "early",
      "late",
      "none",
    ]);
    expect(sortLeads(rows, "followUpDate", "desc").map((l) => l.id)).toEqual([
      "late",
      "early",
      "none",
    ]);
  });

  it("sorts status by pipeline order, not alphabetically", () => {
    const rows = [
      lead({ id: "dead", status: "Not Interested" }),
      lead({ id: "new", status: "New Lead" }),
      lead({ id: "booked", status: "Booked" }),
    ];
    expect(sortLeads(rows, "status", "asc").map((l) => l.id)).toEqual([
      "new",
      "booked",
      "dead",
    ]);
    expect(sortLeads(rows, "status", "desc").map((l) => l.id)).toEqual([
      "dead",
      "booked",
      "new",
    ]);
  });

  it("does not mutate the input list", () => {
    const input = byName.slice();
    sortLeads(input, "firstName", "asc");
    expect(input.map((l) => l.id)).toEqual(["b", "a", "c"]);
  });
});

describe("STATUS_META", () => {
  it("covers exactly the six pipeline stages", () => {
    const metaKeys = Object.keys(STATUS_META).sort();
    const statusKeys = [...LEAD_STATUSES].sort();
    expect(LEAD_STATUSES).toHaveLength(6);
    expect(metaKeys).toEqual(statusKeys);
  });

  it("gives every status a tile class, a pill class and a swatch", () => {
    for (const status of LEAD_STATUSES) {
      const meta = STATUS_META[status as AdminLeadStatus];
      expect(meta.tileClass).toBeTruthy();
      expect(meta.pillClass).toBeTruthy();
      expect(meta.swatch).toMatch(/^#[0-9a-f]{6}$/i);
      expect(meta.label).toBeTruthy();
    }
  });
});

describe("metaFor", () => {
  it("returns the stage's own meta for a known status", () => {
    for (const status of LEAD_STATUSES) {
      expect(metaFor(status)).toEqual(STATUS_META[status as AdminLeadStatus]);
    }
  });

  // The regression this helper exists for: reading .swatch straight off
  // STATUS_META took the page down twice on 2026-07-26.
  it("falls back rather than returning undefined for a status it has never seen", () => {
    const meta = metaFor("Brushed Off");
    expect(meta).toBeDefined();
    expect(meta.swatch).toMatch(/^#[0-9a-f]{6}$/i);
    expect(meta.tileClass).toBeTruthy();
    expect(meta.pillClass).toBeTruthy();
  });

  it("labels an unknown status with the raw status, so the drift is visible", () => {
    expect(metaFor("Brushed Off").label).toBe("Brushed Off");
    expect(metaFor("Some Stage Jake Added In GHL").label).toBe("Some Stage Jake Added In GHL");
  });

  it("survives an empty status", () => {
    expect(metaFor("").label).toBe("Unknown");
    expect(metaFor("").swatch).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("blankLeadDraft", () => {
  it("starts in the first stage, dated today, with no attempts", () => {
    const draft = blankLeadDraft("temp-1");
    expect(draft.id).toBe("temp-1");
    expect(draft.status).toBe("New Lead");
    expect(draft.firstContactDate).toBe(todayIso());
    expect(draft.lastContact).toBe(todayIso());
    expect(draft.noAnswer).toBe(0);
    expect(draft.firstName).toBe("");
    expect(draft.appointmentDate).toBeNull();
  });

  it("mints a distinct temp id when none is supplied", () => {
    expect(blankLeadDraft().id).toMatch(/^temp-/);
  });
});
