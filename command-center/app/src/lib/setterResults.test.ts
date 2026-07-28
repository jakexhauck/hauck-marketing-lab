import { describe, it, expect } from "vitest";
import { buildResults, isEstimateStage, isWonStage, waitingSinceMs } from "./setterResults";
import type { ApiSetterLead } from "./api";
import type { ApiSetterEvent } from "./api";

const NOW = new Date("2026-07-22T15:00:00Z").getTime();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function lead(over: Partial<ApiSetterLead>): ApiSetterLead {
  return {
    id: over.contactId ? `opp_${over.contactId}` : "opp_x",
    contactId: "c1",
    name: "Lead",
    phone: "",
    city: "",
    stageName: "Estimate Scheduled",
    createdAt: new Date(NOW - 5 * DAY).toISOString(),
    updatedAt: null,
    attempts: 0,
    firstDialedAt: null,
    contacted: false,
    lastOutcome: null,
    tags: [],
    ...over,
  };
}

function event(contactId: string, startMsOffset: number, status = "confirmed"): ApiSetterEvent {
  return {
    id: `ev_${contactId}_${startMsOffset}`,
    title: "Estimate visit",
    startTime: new Date(NOW + startMsOffset).toISOString(),
    endTime: null,
    status,
    contactId,
    contactName: "",
  };
}

describe("stage matchers", () => {
  it("recognizes the live Estimate Scheduled stage", () => {
    expect(isEstimateStage("Estimate Scheduled")).toBe(true);
    expect(isEstimateStage("estimate scheduled ")).toBe(true);
  });

  it("does not treat the retired Estimate Completed stage as pending", () => {
    expect(isEstimateStage("Estimate Completed")).toBe(false);
  });

  it("recognizes both won stages and nothing else", () => {
    expect(isWonStage("Job Booked")).toBe(true);
    expect(isWonStage("Job Completed")).toBe(true);
    expect(isWonStage("Phone Appt Booked")).toBe(false);
    expect(isWonStage("Estimate Scheduled")).toBe(false);
  });
});

describe("buildResults", () => {
  it("puts an estimate lead with a future visit in upcoming, soonest first", () => {
    const leads = [
      lead({ contactId: "a", name: "A" }),
      lead({ contactId: "b", name: "B" }),
    ];
    const events = [event("a", 3 * DAY), event("b", 1 * DAY)];
    const m = buildResults(leads, events, NOW);
    expect(m.upcoming.map((r) => r.lead.name)).toEqual(["B", "A"]);
    expect(m.awaiting).toHaveLength(0);
  });

  it("puts an estimate lead whose visit passed in awaiting, longest wait first", () => {
    const leads = [
      lead({ contactId: "a", name: "A" }),
      lead({ contactId: "b", name: "B" }),
    ];
    const events = [event("a", -1 * DAY), event("b", -4 * DAY)];
    const m = buildResults(leads, events, NOW);
    expect(m.awaiting.map((r) => r.lead.name)).toEqual(["B", "A"]);
    expect(m.upcoming).toHaveLength(0);
  });

  it("treats an estimate lead with no visit on the calendar as awaiting, anchored to createdAt", () => {
    const l = lead({ contactId: "a", createdAt: new Date(NOW - 6 * DAY).toISOString() });
    const m = buildResults([l], [], NOW);
    expect(m.awaiting).toHaveLength(1);
    expect(m.awaiting[0].appt).toBeNull();
    expect(waitingSinceMs(m.awaiting[0])).toBe(NOW - 6 * DAY);
  });

  it("anchors waiting time to the passed visit when one exists", () => {
    const l = lead({ contactId: "a", createdAt: new Date(NOW - 10 * DAY).toISOString() });
    const m = buildResults([l], [event("a", -2 * DAY)], NOW);
    expect(waitingSinceMs(m.awaiting[0])).toBe(NOW - 2 * DAY);
  });

  it("ignores cancelled visits when resolving the appointment", () => {
    const l = lead({ contactId: "a" });
    const m = buildResults([l], [event("a", 2 * DAY, "cancelled")], NOW);
    expect(m.awaiting).toHaveLength(1);
    expect(m.upcoming).toHaveLength(0);
  });

  it("collects won leads sorted by most recent move, and counts the recent window", () => {
    const leads = [
      lead({
        contactId: "w1", name: "Old Win", stageName: "Job Completed",
        updatedAt: new Date(NOW - 40 * DAY).toISOString(),
      }),
      lead({
        contactId: "w2", name: "New Win", stageName: "Job Booked",
        updatedAt: new Date(NOW - 2 * DAY).toISOString(),
      }),
    ];
    const m = buildResults(leads, [], NOW);
    expect(m.won.map((r) => r.lead.name)).toEqual(["New Win", "Old Win"]);
    expect(m.wonRecentCount).toBe(1);
  });

  it("falls back to createdAt for a won lead missing updatedAt", () => {
    const l = lead({
      contactId: "w1", stageName: "Job Booked",
      createdAt: new Date(NOW - 3 * DAY).toISOString(), updatedAt: null,
    });
    const m = buildResults([l], [], NOW);
    expect(m.wonRecentCount).toBe(1);
  });

  it("ignores leads in unrelated stages entirely", () => {
    const m = buildResults(
      [lead({ stageName: "New Lead" }), lead({ contactId: "c2", stageName: "Long Term Nurture" })],
      [],
      NOW,
    );
    expect(m.upcoming).toHaveLength(0);
    expect(m.awaiting).toHaveLength(0);
    expect(m.won).toHaveLength(0);
  });

  it("computes the conversion rate as won over won plus awaiting", () => {
    const leads = [
      lead({ contactId: "w1", stageName: "Job Booked", updatedAt: new Date(NOW).toISOString() }),
      lead({ contactId: "w2", stageName: "Job Completed", updatedAt: new Date(NOW).toISOString() }),
      lead({ contactId: "a1" }),
    ];
    const m = buildResults(leads, [event("a1", -1 * DAY)], NOW);
    expect(m.convRate).toBeCloseTo(2 / 3);
  });

  it("conversion rate is null when nothing has reached a countable state", () => {
    const m = buildResults([lead({ stageName: "New Lead" })], [], NOW);
    expect(m.convRate).toBeNull();
  });

  it("upcoming leads do not drag the conversion rate down", () => {
    const leads = [
      lead({ contactId: "w1", stageName: "Job Booked", updatedAt: new Date(NOW).toISOString() }),
      lead({ contactId: "u1" }),
    ];
    const m = buildResults(leads, [event("u1", 2 * DAY)], NOW);
    expect(m.convRate).toBe(1);
  });
});
