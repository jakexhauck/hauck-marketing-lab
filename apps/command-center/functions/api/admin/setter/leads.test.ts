import { describe, it, expect } from "vitest";
import { shapeSetterLead } from "./leads";
import { rollUpByContact } from "../../../lib/setterMetrics";
import type { GhlOpportunity } from "../../../lib/ghl";

const stageNames = new Map([
  ["s1", "Opted In (needs dialing)"],
  ["s2", "Long Term Nurture"],
]);

describe("shapeSetterLead", () => {
  it("merges a contact's dial roll-up into the card", () => {
    const rollUps = rollUpByContact([
      { contact_id: "c1", dialed_at: "2026-07-20T09:00:00Z", spoke: false, outcome: "no_answer" },
      { contact_id: "c1", dialed_at: "2026-07-20T17:00:00Z", spoke: true, outcome: "booked" },
    ]);
    const o: GhlOpportunity = {
      id: "o1",
      name: "Jane Doe",
      pipelineStageId: "s1",
      contact: { id: "c1", phone: "555-1000", city: "Garden City" },
      createdAt: "2026-07-19T00:00:00Z",
    };

    const lead = shapeSetterLead(o, stageNames, rollUps);

    expect(lead).toEqual({
      id: "o1",
      contactId: "c1",
      name: "Jane Doe",
      phone: "555-1000",
      city: "Garden City",
      stageName: "Opted In (needs dialing)",
      createdAt: "2026-07-19T00:00:00Z",
      updatedAt: null,
      attempts: 2,
      firstDialedAt: "2026-07-20T09:00:00Z",
      contacted: true,
      lastOutcome: "booked",
      tags: [],
      // No DND index passed, so nothing is known about this contact. Null is
      // the honest answer and the card renders it as no claim, never as an
      // all-clear.
      dnd: null,
    });
  });

  // The opportunity search does NOT carry DND (verified live 2026-07-29: its
  // contact object is {id, name, companyName, email, phone, tags, score}),
  // which is why the route reads the contact roster alongside and hands the
  // index in here.
  it("attaches DND from the contact roster index", () => {
    const o: GhlOpportunity = {
      id: "o1",
      contact: { id: "c1", name: "Jane Doe" },
      pipelineStageId: "s1",
      createdAt: "2026-07-19T00:00:00Z",
    };
    const lead = shapeSetterLead(
      o,
      new Map([["s1", "Opted In"]]),
      new Map(),
      new Map([["c1", { all: false, channels: ["Call"], reasons: {} }]]),
    );
    expect(lead.dnd).toEqual({ all: false, channels: ["Call"], reasons: {} });
  });

  it("leaves DND null for a lead the roster did not hold", () => {
    const o: GhlOpportunity = {
      id: "o1",
      contact: { id: "c9", name: "Jane Doe" },
      pipelineStageId: "s1",
      createdAt: "2026-07-19T00:00:00Z",
    };
    const lead = shapeSetterLead(o, new Map([["s1", "Opted In"]]), new Map(), new Map());
    expect(lead.dnd).toBeNull();
  });

  it("carries the contact's tags through from the opportunity search", () => {
    const o: GhlOpportunity = {
      id: "o3",
      name: "Tagged Lead",
      pipelineStageId: "s1",
      contact: { id: "c3", tags: ["funnel survey completed", "phone appointment booked"] },
      createdAt: "2026-07-19T00:00:00Z",
    };
    expect(shapeSetterLead(o, stageNames, new Map()).tags).toEqual([
      "funnel survey completed",
      "phone appointment booked",
    ]);
  });

  // A location whose search response omits contact.tags must read as "no
  // evidence", never as undefined: the follow-up tag and the confirm alert
  // both branch on this array.
  it("defaults tags to an empty array when the response omits them", () => {
    const o: GhlOpportunity = {
      id: "o4",
      pipelineStageId: "s1",
      contact: { id: "c4" },
      createdAt: "2026-07-19T00:00:00Z",
    };
    expect(shapeSetterLead(o, stageNames, new Map()).tags).toEqual([]);
  });

  it("defaults every dial field for a lead never dialed", () => {
    const o: GhlOpportunity = {
      id: "o2",
      contactId: "c2",
      pipelineStageId: "s2",
      contact: { id: "c2" },
    };

    const lead = shapeSetterLead(o, stageNames, new Map());

    expect(lead.attempts).toBe(0);
    expect(lead.firstDialedAt).toBeNull();
    expect(lead.contacted).toBe(false);
    expect(lead.lastOutcome).toBeNull();
  });

  it("falls back to the contact's first+last name when the opportunity has no name", () => {
    const o: GhlOpportunity = {
      id: "o3",
      pipelineStageId: "s1",
      contact: { id: "c3", firstName: "Sam", lastName: "Rivera" },
    };
    expect(shapeSetterLead(o, stageNames, new Map()).name).toBe("Sam Rivera");
  });

  it("falls back to Unknown when there is no opportunity name or contact name at all", () => {
    const o: GhlOpportunity = { id: "o4", pipelineStageId: "s1", contact: { id: "c4" } };
    expect(shapeSetterLead(o, stageNames, new Map()).name).toBe("Unknown");
  });

  it("resolves stageName to empty string for an unknown stage id, never a stale guess", () => {
    const o: GhlOpportunity = { id: "o5", pipelineStageId: "does-not-exist", contact: { id: "c5" } };
    expect(shapeSetterLead(o, stageNames, new Map()).stageName).toBe("");
  });

  it("prefers contact.id over the opportunity's own contactId when both are present", () => {
    const o: GhlOpportunity = { id: "o6", contactId: "wrong", pipelineStageId: "s1", contact: { id: "right" } };
    expect(shapeSetterLead(o, stageNames, new Map()).contactId).toBe("right");
  });

  it("defaults phone and city to empty strings, never undefined, when the contact omits them", () => {
    const o: GhlOpportunity = { id: "o7", pipelineStageId: "s1", contact: { id: "c7" } };
    const lead = shapeSetterLead(o, stageNames, new Map());
    expect(lead.phone).toBe("");
    expect(lead.city).toBe("");
  });
});
