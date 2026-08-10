import { describe, expect, it } from "vitest";
import { pickEstimateCalendar, planBlocks, type ExistingBlock } from "./calendarSync";
import type { SyncableBusyEvent } from "./googleCalendar";

// The diff is where every interesting failure of this feature lives, which is
// why it is a pure function. A meeting that moves must move its block, not grow
// a second one; a cancelled meeting must give the client their slot back; and
// our own mirrored appointments must never be blocked against themselves.

function ev(over: Partial<SyncableBusyEvent> & { id: string }): SyncableBusyEvent {
  return {
    start: "2026-08-11T09:00:00Z",
    end: "2026-08-11T10:00:00Z",
    title: "Meeting",
    isMirror: false,
    ...over,
  };
}

function block(over: Partial<ExistingBlock> & { gcal_event_id: string }): ExistingBlock {
  return {
    ghl_block_id: `blk_${over.gcal_event_id}`,
    starts_at: "2026-08-11T09:00:00Z",
    ends_at: "2026-08-11T10:00:00Z",
    ...over,
  };
}

describe("pickEstimateCalendar", () => {
  // The live names on the wired sub-account, pulled 2026-08-10.
  const live = [
    { id: "c1", name: "Job" },
    { id: "c2", name: "Phone Appointment" },
    { id: "c3", name: "Home Estimate" },
    { id: "c4", name: "Window Cleaning Service" },
  ];

  it("finds Home Estimate among the client's real calendars", () => {
    expect(pickEstimateCalendar(live)?.id).toBe("c3");
  });

  it("falls back to a looser estimate match", () => {
    const other = [{ id: "x", name: "Free Estimate Visit" }];
    expect(pickEstimateCalendar(other)?.id).toBe("x");
  });

  it("prefers the explicit per-client override", () => {
    expect(pickEstimateCalendar(live, "c1")?.id).toBe("c1");
  });

  it("returns null rather than guessing when nothing matches", () => {
    // Blocking the wrong calendar would strip availability from a service the
    // client sells, silently. No match must mean no writes.
    expect(pickEstimateCalendar([{ id: "z", name: "Job" }])).toBeNull();
    expect(pickEstimateCalendar([])).toBeNull();
  });

  it("returns null when the override names a calendar that no longer exists", () => {
    expect(pickEstimateCalendar(live, "deleted")).toBeNull();
  });
});

describe("planBlocks", () => {
  it("creates a block for a new commitment", () => {
    const plan = planBlocks([ev({ id: "g1" })], []);
    expect(plan.create.map((e) => e.id)).toEqual(["g1"]);
    expect(plan.update).toEqual([]);
    expect(plan.remove).toEqual([]);
  });

  it("does nothing when a commitment is unchanged", () => {
    const plan = planBlocks([ev({ id: "g1" })], [block({ gcal_event_id: "g1" })]);
    expect(plan).toEqual({ create: [], update: [], remove: [] });
  });

  it("updates rather than duplicates when a meeting moves", () => {
    const plan = planBlocks(
      [ev({ id: "g1", start: "2026-08-11T14:00:00Z", end: "2026-08-11T15:00:00Z" })],
      [block({ gcal_event_id: "g1" })],
    );
    expect(plan.create).toEqual([]);
    expect(plan.update).toHaveLength(1);
    expect(plan.update[0].blockId).toBe("blk_g1");
  });

  it("treats the same instant written differently as unchanged", () => {
    // Postgres hands timestamps back as "+00:00", Google sends "Z". A string
    // compare would rewrite every block on every run, forever.
    const plan = planBlocks(
      [ev({ id: "g1", start: "2026-08-11T09:00:00Z", end: "2026-08-11T10:00:00Z" })],
      [
        block({
          gcal_event_id: "g1",
          starts_at: "2026-08-11T09:00:00+00:00",
          ends_at: "2026-08-11T10:00:00+00:00",
        }),
      ],
    );
    expect(plan.update).toEqual([]);
  });

  it("removes the block when the meeting is cancelled", () => {
    // Without this the client loses that slot permanently, with no error
    // anywhere and no way to find the cause.
    const plan = planBlocks([], [block({ gcal_event_id: "g1" })]);
    expect(plan.remove.map((b) => b.ghl_block_id)).toEqual(["blk_g1"]);
  });

  it("never blocks our own mirrored appointments", () => {
    // A GHL appointment is mirrored into Google, reads back as busy, and would
    // be written into GHL as a block on top of itself. The double-block would
    // compound on every run until the calendar was unusable.
    const plan = planBlocks([ev({ id: "g1", isMirror: true })], []);
    expect(plan.create).toEqual([]);
  });

  it("removes a block whose event has become one of our mirrors", () => {
    const plan = planBlocks(
      [ev({ id: "g1", isMirror: true })],
      [block({ gcal_event_id: "g1" })],
    );
    expect(plan.remove.map((b) => b.gcal_event_id)).toEqual(["g1"]);
  });

  it("handles a mixed diff in one pass", () => {
    const plan = planBlocks(
      [
        ev({ id: "keep" }),
        ev({ id: "moved", start: "2026-08-12T09:00:00Z", end: "2026-08-12T10:00:00Z" }),
        ev({ id: "new" }),
      ],
      [block({ gcal_event_id: "keep" }), block({ gcal_event_id: "moved" }), block({ gcal_event_id: "gone" })],
    );
    expect(plan.create.map((e) => e.id)).toEqual(["new"]);
    expect(plan.update.map((u) => u.event.id)).toEqual(["moved"]);
    expect(plan.remove.map((b) => b.gcal_event_id)).toEqual(["gone"]);
  });
});
