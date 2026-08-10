import { describe, it, expect } from "vitest";
import {
  resolveClientInboxScope,
  buildVisibleContactIds,
  contactIsInScope,
  WILLIS_HANDOFF_PIPELINE_ID,
  WILLIS_REVIEWS_PIPELINE_ID,
} from "./handoffScope";

// The live Willis pipeline list, pulled from `ghl opportunities pipelines`
// 2026-08-10. Names carry their "N) " ordering prefix, which is exactly why the
// resolver cannot match on equality alone.
const WILLIS = [
  { id: "jrQQItCcwN6p7VUIhdRC", name: "1) Leads" },
  { id: "XGiMg6DhzjGzTfWAVyL5", name: "2) No Answer" },
  { id: WILLIS_HANDOFF_PIPELINE_ID, name: "3) Sales" },
  { id: "wLE6lxlQtRDNZjkmUrEX", name: "4) Trash" },
  { id: "ElzjlzovQewPnhpXq7Pj", name: "Organic" },
  { id: WILLIS_REVIEWS_PIPELINE_ID, name: "Google Reviews" },
  { id: "jEmFCPeo68g1DVFvfqaF", name: "News Channel" },
];

describe("resolveClientInboxScope", () => {
  it("finds the live Willis Sales pipeline through its '3) ' prefix", () => {
    const scope = resolveClientInboxScope(WILLIS, undefined);
    expect(scope?.handoffPipelineId).toBe(WILLIS_HANDOFF_PIPELINE_ID);
  });

  it("picks up the Google Reviews pipeline alongside it", () => {
    const scope = resolveClientInboxScope(WILLIS, undefined);
    expect(scope?.reviewsPipelineId).toBe(WILLIS_REVIEWS_PIPELINE_ID);
  });

  it("prefers an exact name match over a substring one", () => {
    const scope = resolveClientInboxScope(
      [
        { id: "substr", name: "Sales Follow Up" },
        { id: "exact", name: "Sales" },
      ],
      undefined,
    );
    expect(scope?.handoffPipelineId).toBe("exact");
  });

  it("honours the per-tenant override ahead of the name ladder", () => {
    const scope = resolveClientInboxScope(
      [
        { id: "named-sales", name: "Sales" },
        { id: "their-own", name: "Booked Work" },
      ],
      "their-own",
    );
    expect(scope?.handoffPipelineId).toBe("their-own");
  });

  // An override typo must not silently open the gate: it falls through to the
  // name ladder, which still finds the real pipeline.
  it("falls back to the name ladder when the override matches nothing", () => {
    const scope = resolveClientInboxScope(
      [{ id: "named-sales", name: "Sales" }],
      "no-such-pipeline-id",
    );
    expect(scope?.handoffPipelineId).toBe("named-sales");
  });

  // The gate-off case Jake chose: a client with no recognisable hand-off
  // pipeline keeps seeing exactly what they see today. Nobody's Inbox goes
  // blank because of a config gap.
  it("returns null when no hand-off pipeline can be resolved", () => {
    expect(
      resolveClientInboxScope([{ id: "x", name: "Enquiries" }], undefined),
    ).toBeNull();
  });

  it("returns null on an empty pipeline list", () => {
    expect(resolveClientInboxScope([], undefined)).toBeNull();
  });

  // A client with no reviews pipeline is normal, not a failure.
  it("resolves the hand-off pipeline even with no Google Reviews pipeline", () => {
    const scope = resolveClientInboxScope([{ id: "s", name: "Sales" }], undefined);
    expect(scope?.handoffPipelineId).toBe("s");
    expect(scope?.reviewsPipelineId).toBeNull();
  });
});

describe("buildVisibleContactIds", () => {
  const scope = { handoffPipelineId: "sales", reviewsPipelineId: "reviews" };

  it("admits a contact sitting in the hand-off pipeline", () => {
    const ids = buildVisibleContactIds(scope, [
      { contactId: "handed-off", pipelineId: "sales" },
    ]);
    expect(ids.has("handed-off")).toBe(true);
  });

  it("admits a review-request contact so Reviews > Chats keeps working", () => {
    const ids = buildVisibleContactIds(scope, [
      { contactId: "past-customer", pipelineId: "reviews" },
    ]);
    expect(ids.has("past-customer")).toBe(true);
  });

  it("shuts out a lead still being worked in Leads, No Answer or Trash", () => {
    const ids = buildVisibleContactIds(scope, [
      { contactId: "raw-lead", pipelineId: "leads" },
      { contactId: "chased", pipelineId: "no-answer" },
      { contactId: "binned", pipelineId: "trash" },
    ]);
    expect(ids.size).toBe(0);
  });

  // The common real shape: one contact holds several opportunities at once.
  it("admits a contact who is in the hand-off pipeline AND an upstream one", () => {
    const ids = buildVisibleContactIds(scope, [
      { contactId: "both", pipelineId: "leads" },
      { contactId: "both", pipelineId: "sales" },
    ]);
    expect(ids.has("both")).toBe(true);
  });

  it("ignores opportunities with no contact", () => {
    const ids = buildVisibleContactIds(scope, [
      { contactId: "", pipelineId: "sales" },
    ]);
    expect(ids.size).toBe(0);
  });

  it("admits nobody when the client has no reviews pipeline and no sales opps", () => {
    const ids = buildVisibleContactIds(
      { handoffPipelineId: "sales", reviewsPipelineId: null },
      [{ contactId: "a", pipelineId: "reviews" }],
    );
    expect(ids.size).toBe(0);
  });
});

describe("contactIsInScope", () => {
  const scope = { handoffPipelineId: "sales", reviewsPipelineId: "reviews" };

  it("is true for a handed-off contact", () => {
    expect(
      contactIsInScope(scope, [{ contactId: "c", pipelineId: "sales" }]),
    ).toBe(true);
  });

  it("is false for a contact only in an upstream pipeline", () => {
    expect(
      contactIsInScope(scope, [{ contactId: "c", pipelineId: "leads" }]),
    ).toBe(false);
  });

  // A contact with no opportunity at all has never been handed off.
  it("is false for a contact with no opportunities", () => {
    expect(contactIsInScope(scope, [])).toBe(false);
  });
});
