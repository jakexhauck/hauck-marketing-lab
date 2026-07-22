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
    });
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
