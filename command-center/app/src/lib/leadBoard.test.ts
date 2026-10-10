import { describe, expect, it } from "vitest";
import { applyMoveLocally, askFor, leadFlags, matchesFocus, type BoardLead } from "./leadBoard";

const NOW = Date.parse("2026-10-08T15:00:00Z");
const lead = (p: Partial<BoardLead> = {}): BoardLead => ({
  id: "o1",
  contactId: "c1",
  name: "Dana",
  phone: "",
  createdAt: new Date(NOW - 10 * 60_000).toISOString(),
  stageId: "s",
  value: null,
  bookings: [],
  followUp: null,
  lostReason: null,
  attempts: 0,
  ...p,
});

describe("leadFlags", () => {
  it("a new lead turns stale after an hour", () => {
    expect(leadFlags(lead(), "lead", NOW).staleNew).toBe(false);
    const old = lead({ createdAt: new Date(NOW - 61 * 60_000).toISOString() });
    expect(leadFlags(old, "lead", NOW).staleNew).toBe(true);
    expect(leadFlags(old, "won", NOW).staleNew).toBe(false);
  });
  it("a booking in the past needs an outcome, only in its own stage", () => {
    const l = lead({ bookings: [{ kind: "estimate", at: new Date(NOW - 3600_000).toISOString() }] });
    expect(leadFlags(l, "estimate", NOW).needsOutcome).toBe(true);
    expect(leadFlags(l, "job", NOW).needsOutcome).toBe(false);
    expect(leadFlags(l, "cancelled", NOW).needsOutcome).toBe(false);
  });
  it("follow-ups: overdue when past, due when today", () => {
    const past = lead({ followUp: { at: new Date(NOW - 60_000).toISOString(), note: "" } });
    expect(leadFlags(past, "followUp", NOW)).toMatchObject({ followOverdue: true, followDue: true });
    const later = lead({ followUp: { at: new Date(NOW + 5 * 86_400_000).toISOString(), note: "" } });
    expect(leadFlags(later, "followUp", NOW)).toMatchObject({ followOverdue: false, followDue: false });
  });
});

describe("matchesFocus", () => {
  it("New is every lead in the Lead stage", () => {
    expect(matchesFocus("new", "lead", leadFlags(lead(), "lead", NOW))).toBe(true);
    expect(matchesFocus("new", "won", leadFlags(lead(), "won", NOW))).toBe(false);
  });
});

describe("askFor", () => {
  it("matches Jake's drop rules", () => {
    expect(askFor("followUp")).toBe("followUp");
    expect(askFor("estimate")).toBe("datetime");
    expect(askFor("job")).toBe("datetime");
    expect(askFor("won")).toBe("value");
    expect(askFor("lost")).toBe("reason");
    for (const k of ["lead", "nurture", "cancelled", "trash", null] as const) expect(askFor(k)).toBe("none");
  });
});

describe("applyMoveLocally", () => {
  it("Job Booked replaces the estimate with the job", () => {
    const l = lead({ bookings: [{ kind: "estimate", at: "2026-10-09T15:00:00.000Z" }] });
    const next = applyMoveLocally(l, "job", { id: "o1", stageId: "sj", at: "2026-10-12T13:00:00.000Z" });
    expect(next.bookings).toEqual([{ kind: "job", at: "2026-10-12T13:00:00.000Z" }]);
  });
  it("Cancelled keeps bookings", () => {
    const l = lead({ bookings: [{ kind: "estimate", at: "2026-10-09T15:00:00.000Z" }] });
    expect(applyMoveLocally(l, "cancelled", { id: "o1", stageId: "sc" }).bookings).toHaveLength(1);
  });
  it("moving off Follow Up drops the follow-up", () => {
    const l = lead({ followUp: { at: "2026-10-09T15:00:00.000Z", note: "x" } });
    expect(applyMoveLocally(l, "lead", { id: "o1", stageId: "sl" }).followUp).toBeNull();
  });
});
