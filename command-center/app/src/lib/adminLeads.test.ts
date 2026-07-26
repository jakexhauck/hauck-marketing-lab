import { describe, it, expect } from "vitest";
import type { AdminLead, AdminLeadStatus } from "./api";
import {
  LEAD_STATUSES,
  STATUS_META,
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
    status: "New",
    firstContactDate: null,
    source: "",
    appointmentDate: null,
    noAnswer: 0,
    lastContact: null,
    followUpDate: null,
    email: "",
    notes: "",
  assignedTo: null,
    createdAt: "2026-07-17T00:00:00.000Z",
    ...over,
  };
}

const mixed: AdminLead[] = [
  lead({ id: "1", status: "New" }),
  lead({ id: "2", status: "New" }),
  lead({ id: "3", status: "Contacted" }),
  lead({ id: "4", status: "No Answer" }),
  lead({ id: "5", status: "Booked" }),
  lead({ id: "6", status: "Dead" }),
];

describe("countByStatus / totalCount", () => {
  it("counts each status across a mixed list", () => {
    const counts = countByStatus(mixed);
    expect(counts.New).toBe(2);
    expect(counts.Contacted).toBe(1);
    expect(counts["No Answer"]).toBe(1);
    expect(counts.Booked).toBe(1);
    expect(counts.Qualified).toBe(0);
    expect(counts.Closed).toBe(0);
    expect(counts.Dead).toBe(1);
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
    const rows = filterByStatus(mixed, "New");
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
      lead({ id: "dead", status: "Dead" }),
      lead({ id: "new", status: "New" }),
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
  it("covers exactly the seven LEAD_STATUSES", () => {
    const metaKeys = Object.keys(STATUS_META).sort();
    const statusKeys = [...LEAD_STATUSES].sort();
    expect(LEAD_STATUSES).toHaveLength(7);
    expect(metaKeys).toEqual(statusKeys);
  });

  it("gives every status a tile class, a pill class and a swatch", () => {
    for (const status of LEAD_STATUSES) {
      const meta = STATUS_META[status as AdminLeadStatus];
      expect(meta.tileClass).toBeTruthy();
      expect(meta.pillClass).toBeTruthy();
      expect(meta.swatch).toMatch(/^#[0-9a-f]{6}$/i);
      expect(meta.label).toBe(status);
    }
  });
});

describe("blankLeadDraft", () => {
  it("starts as a New lead dated today with no attempts", () => {
    const draft = blankLeadDraft("temp-1");
    expect(draft.id).toBe("temp-1");
    expect(draft.status).toBe("New");
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
