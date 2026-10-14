import { describe, expect, it } from "vitest";
import {
  APP_COVERED_TYPES,
  appEventId,
  normalizeAppEvent,
  toActivity,
} from "./ghlEvents";

// The Marketplace app's payloads, as distinct from the custom payloads a
// workflow's Webhook action sends. The two dialects disagreeing is the failure
// this file exists to prevent.

describe("normalizeAppEvent", () => {
  it("maps an opportunity payload's `id` onto opportunityId", () => {
    // The bug this prevents: fed straight into toActivity, an app payload
    // writes an activity row with a null lead_id, which renders as a lead the
    // client cannot open.
    const out = normalizeAppEvent({
      type: "OpportunityCreate",
      locationId: "loc",
      id: "opp_1",
      contactId: "c_1",
    });
    expect(out.opportunityId).toBe("opp_1");
    expect(out.contactId).toBe("c_1");
  });

  it("maps a contact payload's `id` onto contactId, not opportunityId", () => {
    const out = normalizeAppEvent({ type: "ContactCreate", locationId: "loc", id: "c_9" });
    expect(out.contactId).toBe("c_9");
    expect(out.opportunityId).toBeUndefined();
  });

  it("never overwrites a field that is already in the right place", () => {
    const out = normalizeAppEvent({
      type: "OpportunityStageUpdate",
      id: "delivery_id",
      opportunityId: "real_opp",
    });
    expect(out.opportunityId).toBe("real_opp");
  });

  it("reads ids out of nested opportunity and appointment shapes", () => {
    const out = normalizeAppEvent({
      type: "AppointmentCreate",
      appointment: { contactId: "c_2" },
      opportunity: { id: "opp_2", assignedTo: "user_7" },
    });
    expect(out.contactId).toBe("c_2");
    expect(out.opportunityId).toBe("opp_2");
    expect(out.assignedTo).toBe("user_7");
  });

  it("produces an activity a normalized payload can actually fill", () => {
    const raw = { type: "OpportunityCreate", locationId: "loc", id: "opp_3" };
    expect(toActivity("t1", raw)?.opportunity_id).toBeNull();
    expect(toActivity("t1", normalizeAppEvent(raw))?.opportunity_id).toBe("opp_3");
  });
});

describe("appEventId", () => {
  it("prefers webhookId, which is unique per delivery", () => {
    expect(appEventId({ webhookId: "wh_1", id: "opp_1" })).toBe("wh_1");
  });

  it("falls back to subject id plus timestamp, so two real moves do not collide", () => {
    const first = appEventId({ id: "opp_1", timestamp: "2026-08-10T10:00:00Z" });
    const second = appEventId({ id: "opp_1", timestamp: "2026-08-10T11:00:00Z" });
    expect(first).not.toBe(second);
  });

  it("returns null rather than a colliding key when there is nothing stable", () => {
    // null means "insert without dedup", which is what the legacy path already
    // does for id-less workflow payloads. Returning the subject id alone would
    // collapse every stage move on one opportunity into a single feed row.
    expect(appEventId({ id: "opp_1" })).toBeNull();
    expect(appEventId({})).toBeNull();
  });
});

describe("APP_COVERED_TYPES", () => {
  it("covers the types both sources would fire for", () => {
    for (const type of [
      "OpportunityCreate",
      "OpportunityStageUpdate",
      "OpportunityStatusUpdate",
      "AppointmentCreate",
      "InvoicePaid",
      "InboundMessage",
    ]) {
      expect(APP_COVERED_TYPES.has(type)).toBe(true);
    }
  });

  it("never covers LeadStatusUpdate", () => {
    // No native GHL event emits Jake's 12-status cadence. Covering it would
    // silence the only source of it the moment a client is cut over, and the
    // Lead Tracker would stop moving with no error anywhere.
    expect(APP_COVERED_TYPES.has("LeadStatusUpdate")).toBe(false);
  });

  it("never covers InboundCall", () => {
    // The app is not subscribed to call events, so cutting a client over must
    // not drop the workflow that pops the Call Console.
    expect(APP_COVERED_TYPES.has("InboundCall")).toBe(false);
  });
});
