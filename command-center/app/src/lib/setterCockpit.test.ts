import { describe, it, expect } from "vitest";
import {
  OUTCOMES,
  defaultSpokeForOutcome,
  isContradictoryDial,
  buildOptimisticDial,
  isOptimisticDial,
  prependOptimisticDial,
  bumpLeadForDial,
  formatSlotTime,
  formatSlotDay,
  computeSlotEnd,
} from "./setterCockpit";
import type { ApiSetterDial, ApiSetterLead } from "./api";

describe("OUTCOMES", () => {
  it("is exactly Jake's five outcomes, in order, mapped to the API's enum", () => {
    expect(OUTCOMES.map((o) => o.value)).toEqual([
      "booked",
      "not_interested",
      "no_answer",
      "reschedule",
      "bad_lead",
    ]);
    expect(OUTCOMES.map((o) => o.label)).toEqual([
      "Booked",
      "Not interested",
      "No answer",
      "Reschedule",
      "Bad lead",
    ]);
  });
});

describe("defaultSpokeForOutcome", () => {
  it("defaults to false for no_answer, since nobody picked up", () => {
    expect(defaultSpokeForOutcome("no_answer")).toBe(false);
  });
  it("defaults to true for every other outcome", () => {
    expect(defaultSpokeForOutcome("booked")).toBe(true);
    expect(defaultSpokeForOutcome("not_interested")).toBe(true);
    expect(defaultSpokeForOutcome("reschedule")).toBe(true);
    expect(defaultSpokeForOutcome("bad_lead")).toBe(true);
  });
});

describe("isContradictoryDial", () => {
  it("mirrors the server's check: no_answer can never be paired with spoke true", () => {
    expect(isContradictoryDial("no_answer", true)).toBe(true);
  });
  it("is not contradictory when no_answer pairs with spoke false", () => {
    expect(isContradictoryDial("no_answer", false)).toBe(false);
  });
  it("is never contradictory for any other outcome, spoke true or false", () => {
    expect(isContradictoryDial("booked", true)).toBe(false);
    expect(isContradictoryDial("booked", false)).toBe(false);
    expect(isContradictoryDial("reschedule", true)).toBe(false);
  });
});

describe("buildOptimisticDial / isOptimisticDial", () => {
  it("builds a dial row shaped exactly like the server's, tagged with a temp id", () => {
    const dial = buildOptimisticDial(
      {
        contactId: "c1",
        opportunityId: "o1",
        pipelineName: "Sales Pipeline",
        stageName: "Hot Lead",
        spoke: true,
        outcome: "booked",
        note: "Wants a morning slot",
        tagsApplied: ["hot"],
      },
      "2026-07-20T12:00:00.000Z",
      "optimistic-1",
    );
    expect(dial).toEqual({
      id: "optimistic-1",
      contactId: "c1",
      opportunityId: "o1",
      pipelineName: "Sales Pipeline",
      stageName: "Hot Lead",
      dialedAt: "2026-07-20T12:00:00.000Z",
      spoke: true,
      outcome: "booked",
      note: "Wants a morning slot",
      tagsApplied: ["hot"],
      createdBy: null,
      createdAt: "2026-07-20T12:00:00.000Z",
    });
  });

  it("defaults optional fields to null/empty, matching the server shape", () => {
    const dial = buildOptimisticDial(
      { contactId: "c1", spoke: false, outcome: "no_answer" },
      "2026-07-20T12:00:00.000Z",
      "optimistic-2",
    );
    expect(dial.opportunityId).toBeNull();
    expect(dial.pipelineName).toBeNull();
    expect(dial.stageName).toBeNull();
    expect(dial.note).toBeNull();
    expect(dial.tagsApplied).toEqual([]);
  });

  it("isOptimisticDial recognizes a temp id and rejects a real server id", () => {
    expect(isOptimisticDial("optimistic-1")).toBe(true);
    expect(isOptimisticDial("9c6f7c1e-real-uuid")).toBe(false);
  });
});

describe("prependOptimisticDial", () => {
  it("puts the new dial first, newest-first order matching the server", () => {
    const existing: ApiSetterDial[] = [
      {
        id: "d1",
        contactId: "c1",
        opportunityId: null,
        pipelineName: null,
        stageName: null,
        dialedAt: "2026-07-19T12:00:00.000Z",
        spoke: false,
        outcome: "no_answer",
        note: null,
        tagsApplied: [],
        createdBy: "admin1",
        createdAt: "2026-07-19T12:00:00.000Z",
      },
    ];
    const fresh: ApiSetterDial = {
      id: "optimistic-1",
      contactId: "c1",
      opportunityId: null,
      pipelineName: null,
      stageName: null,
      dialedAt: "2026-07-20T12:00:00.000Z",
      spoke: true,
      outcome: "booked",
      note: null,
      tagsApplied: [],
      createdBy: null,
      createdAt: "2026-07-20T12:00:00.000Z",
    };
    expect(prependOptimisticDial(existing, fresh)).toEqual([fresh, existing[0]]);
  });
});

describe("bumpLeadForDial", () => {
  const baseLead: ApiSetterLead = {
    id: "opp1",
    contactId: "c1",
    name: "Jane Doe",
    phone: "5551234567",
    city: "Garden City",
    stageName: "Needs Dialing",
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: null,
    attempts: 0,
    firstDialedAt: null,
    contacted: false,
    lastOutcome: null,
    tags: [],
  };

  it("increments attempts and sets lastOutcome to the new dial's outcome", () => {
    const next = bumpLeadForDial(baseLead, {
      spoke: false,
      outcome: "no_answer",
      dialedAt: "2026-07-20T12:00:00.000Z",
    });
    expect(next.attempts).toBe(1);
    expect(next.lastOutcome).toBe("no_answer");
  });

  it("sets contacted true when the dial was a spoke-with, and sets firstDialedAt when it was null", () => {
    const next = bumpLeadForDial(baseLead, {
      spoke: true,
      outcome: "booked",
      dialedAt: "2026-07-20T12:00:00.000Z",
    });
    expect(next.contacted).toBe(true);
    expect(next.firstDialedAt).toBe("2026-07-20T12:00:00.000Z");
  });

  it("never turns contacted back off, even when the new dial itself did not spoke", () => {
    const contactedLead = { ...baseLead, contacted: true, attempts: 2 };
    const next = bumpLeadForDial(contactedLead, {
      spoke: false,
      outcome: "no_answer",
      dialedAt: "2026-07-20T12:00:00.000Z",
    });
    expect(next.contacted).toBe(true);
  });

  it("leaves an existing firstDialedAt untouched", () => {
    const dialed = { ...baseLead, firstDialedAt: "2026-01-01T00:00:00.000Z", attempts: 1 };
    const next = bumpLeadForDial(dialed, {
      spoke: true,
      outcome: "booked",
      dialedAt: "2026-07-20T12:00:00.000Z",
    });
    expect(next.firstDialedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("does not mutate the original lead object", () => {
    const next = bumpLeadForDial(baseLead, {
      spoke: true,
      outcome: "booked",
      dialedAt: "2026-07-20T12:00:00.000Z",
    });
    expect(baseLead.attempts).toBe(0);
    expect(next).not.toBe(baseLead);
  });
});

describe("formatSlotTime", () => {
  it("renders the wall-clock time encoded in the slot's own offset", () => {
    expect(formatSlotTime("2026-07-08T12:00:00-04:00")).toBe("12:00 PM");
    expect(formatSlotTime("2026-07-08T09:30:00-04:00")).toBe("9:30 AM");
    expect(formatSlotTime("2026-07-08T00:15:00-04:00")).toBe("12:15 AM");
  });
});

describe("formatSlotDay", () => {
  it("renders a short weekday + month + day label, independent of viewer timezone", () => {
    expect(formatSlotDay("2026-07-08")).toBe("Wed, Jul 8");
  });
});

describe("computeSlotEnd", () => {
  it("adds the duration in minutes to the start instant", () => {
    expect(computeSlotEnd("2026-07-08T12:00:00.000Z", 60)).toBe(
      "2026-07-08T13:00:00.000Z",
    );
  });
  it("handles non-hour durations", () => {
    expect(computeSlotEnd("2026-07-08T12:00:00.000Z", 30)).toBe(
      "2026-07-08T12:30:00.000Z",
    );
  });
});
