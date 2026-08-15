import { describe, expect, it } from "vitest";
import {
  BRIDGE_WORKFLOW_NAME,
  bridgeFailureMessage,
  bridgeWorkflowName,
  callStamp,
  ghlEventStartTime,
  latestOutboundCall,
  pickBridgeWorkflow,
  type GhlCallMessage,
  type GhlWorkflowSummary,
} from "./coldCallBridge";
import type { Env } from "./env";

const env = (over: Partial<Env> = {}) => over as Env;

function wf(name: string, status: string, id = name.toLowerCase()): GhlWorkflowSummary {
  return { id, name, status };
}

describe("bridgeWorkflowName", () => {
  it("defaults to the built-in name", () => {
    expect(bridgeWorkflowName(env())).toBe(BRIDGE_WORKFLOW_NAME);
  });

  it("lets the env rename it without a deploy", () => {
    expect(bridgeWorkflowName(env({ AGENCY_GHL_BRIDGE_WORKFLOW: "Power Dialer" }))).toBe(
      "Power Dialer",
    );
  });

  it("treats blank and whitespace as unset", () => {
    expect(bridgeWorkflowName(env({ AGENCY_GHL_BRIDGE_WORKFLOW: "   " }))).toBe(
      BRIDGE_WORKFLOW_NAME,
    );
  });
});

describe("pickBridgeWorkflow", () => {
  it("finds the published workflow by name", () => {
    const list = [wf("Cold Calling Routing", "published"), wf("CC Bridge Dial", "published", "w1")];
    expect(pickBridgeWorkflow(list, "CC Bridge Dial")).toEqual({ ok: true, id: "w1" });
  });

  it("ignores case and surrounding space on both sides", () => {
    const list = [wf("  cc bridge dial  ", "published", "w1")];
    expect(pickBridgeWorkflow(list, " CC Bridge Dial ")).toEqual({ ok: true, id: "w1" });
  });

  it("reports a missing workflow rather than dialing nothing", () => {
    expect(pickBridgeWorkflow([wf("Something Else", "published")], "CC Bridge Dial")).toEqual({
      ok: false,
      error: "workflow_missing",
    });
  });

  // A draft accepts the contact and then does nothing, which on the phones is
  // indistinguishable from a dead button. It gets its own error for that reason.
  it("refuses a draft, separately from a missing one", () => {
    expect(pickBridgeWorkflow([wf("CC Bridge Dial", "draft")], "CC Bridge Dial")).toEqual({
      ok: false,
      error: "workflow_draft",
    });
  });

  it("prefers the published copy when the name is duplicated", () => {
    const list = [wf("CC Bridge Dial", "draft", "copy"), wf("CC Bridge Dial", "published", "live")];
    expect(pickBridgeWorkflow(list, "CC Bridge Dial")).toEqual({ ok: true, id: "live" });
  });

  it("handles an empty account", () => {
    expect(pickBridgeWorkflow([], "CC Bridge Dial")).toEqual({
      ok: false,
      error: "workflow_missing",
    });
  });
});

describe("bridgeFailureMessage", () => {
  it("names the workflow so the caller knows what to look for", () => {
    expect(bridgeFailureMessage("workflow_missing", "CC Bridge Dial")).toContain("CC Bridge Dial");
    expect(bridgeFailureMessage("workflow_draft", "CC Bridge Dial")).toContain("draft");
  });

  it("says something for every failure", () => {
    const codes = [
      "not_configured",
      "no_phone",
      "no_contact",
      "workflow_missing",
      "workflow_draft",
      "enroll_failed",
    ] as const;
    for (const code of codes) {
      expect(bridgeFailureMessage(code, "CC Bridge Dial").length).toBeGreaterThan(10);
    }
  });
});

// The 422 that took the Call button out in prod on 2026-08-15.
describe("ghlEventStartTime", () => {
  it("drops the milliseconds GoHighLevel rejects", () => {
    expect(ghlEventStartTime(new Date("2026-08-15T20:18:39.276Z"))).toBe(
      "2026-08-15T20:18:39+00:00",
    );
  });

  it("matches the shape GoHighLevel's own error documents", () => {
    const out = ghlEventStartTime(new Date("2021-06-23T02:30:00.000Z"));
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    expect(out).not.toContain(".");
    expect(out).not.toContain("Z");
  });

  // The offset has to be real, not decorative: an enrolment stamped a day out
  // would schedule the call rather than place it.
  it("still names the same instant, to the second", () => {
    const at = new Date("2026-08-15T20:18:39.276Z");
    expect(Date.parse(ghlEventStartTime(at))).toBe(Math.floor(at.getTime() / 1000) * 1000);
  });
});

function call(over: Partial<GhlCallMessage> = {}): GhlCallMessage {
  return {
    id: "m1",
    direction: "outbound",
    messageType: "TYPE_CALL",
    dateAdded: "2026-08-14T21:52:31.776Z",
    altId: "CA4484",
    meta: { call: { duration: 74, status: "completed" } },
    ...over,
  };
}

describe("latestOutboundCall", () => {
  it("picks the newest outbound call", () => {
    const older = call({ id: "old", dateAdded: "2026-08-14T20:00:00.000Z" });
    const newer = call({ id: "new", dateAdded: "2026-08-14T21:00:00.000Z" });
    expect(latestOutboundCall([older, newer])?.id).toBe("new");
  });

  it("ignores texts and inbound calls", () => {
    const sms = call({ id: "sms", messageType: "TYPE_SMS" });
    const inbound = call({ id: "in", direction: "inbound" });
    expect(latestOutboundCall([sms, inbound])).toBeNull();
  });

  // The regression that made the read-back look dead. Every call this app
  // places comes from a workflow, and GoHighLevel writes those as
  // TYPE_CAMPAIGN_CALL rather than TYPE_CALL. Shape taken verbatim from a real
  // bridged dial on the agency account, 2026-08-15.
  it("recognises a call placed by the workflow", () => {
    const bridged = call({
      id: "bridged",
      messageType: "TYPE_CAMPAIGN_CALL",
      status: "failed",
      altId: "CA6f5f60e4f94520463b6072c191fd3d38",
      meta: null,
    });
    expect(latestOutboundCall([bridged])?.id).toBe("bridged");
    expect(callStamp(bridged)).toEqual({
      callMessageId: "bridged",
      callSid: "CA6f5f60e4f94520463b6072c191fd3d38",
      callStatus: "failed",
      durationSeconds: null,
    });
  });

  // The whole point of `since`: a prospect called last week must not stamp
  // today's dial with last week's duration.
  it("ignores calls older than the button press", () => {
    const stale = call({ id: "stale", dateAdded: "2026-08-01T10:00:00.000Z" });
    const since = Date.parse("2026-08-14T21:00:00.000Z");
    expect(latestOutboundCall([stale], since)).toBeNull();
    expect(latestOutboundCall([stale, call({ id: "fresh" })], since)?.id).toBe("fresh");
  });

  it("skips a message with an unreadable date", () => {
    expect(latestOutboundCall([call({ dateAdded: "not a date" })])).toBeNull();
    expect(latestOutboundCall([call({ dateAdded: null })])).toBeNull();
  });

  it("returns null for an empty timeline", () => {
    expect(latestOutboundCall([])).toBeNull();
  });
});

describe("callStamp", () => {
  it("reads duration, status and the Twilio id", () => {
    expect(callStamp(call())).toEqual({
      callMessageId: "m1",
      callSid: "CA4484",
      callStatus: "completed",
      durationSeconds: 74,
    });
  });

  // Exactly what an unanswered call looks like, and also what an answered one
  // looks like for the half minute GHL takes to finalise it. Null, not zero.
  it("leaves duration null when GoHighLevel has none yet", () => {
    expect(callStamp(call({ meta: { call: { duration: null, status: "no-answer" } } }))).toEqual({
      callMessageId: "m1",
      callSid: "CA4484",
      callStatus: "no-answer",
      durationSeconds: null,
    });
  });

  it("falls back to the message status when meta carries none", () => {
    const stamped = callStamp(call({ meta: null, status: "completed" }));
    expect(stamped.callStatus).toBe("completed");
    expect(stamped.durationSeconds).toBeNull();
  });

  it("refuses a nonsense duration rather than storing it", () => {
    expect(callStamp(call({ meta: { call: { duration: -5, status: "x" } } })).durationSeconds).toBeNull();
    expect(
      callStamp(call({ meta: { call: { duration: Number.NaN, status: "x" } } })).durationSeconds,
    ).toBeNull();
  });

  it("rounds a fractional duration to whole seconds", () => {
    expect(callStamp(call({ meta: { call: { duration: 12.6, status: "x" } } })).durationSeconds).toBe(
      13,
    );
  });

  it("treats a blank altId as no id at all", () => {
    expect(callStamp(call({ altId: "  " })).callSid).toBeNull();
  });
});
