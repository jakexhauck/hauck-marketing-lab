import { describe, it, expect } from "vitest";
import {
  isIgnored,
  responseMinutes,
  funnel,
  isClosed,
  lostReasonLabel,
  IGNORE_THRESHOLD_MIN,
} from "./handoffModel";
import type { ApiHandoff } from "./api";

const NOW = new Date("2026-07-23T12:00:00Z").getTime();
const MIN = 60_000;

function make(over: Partial<ApiHandoff>): ApiHandoff {
  return {
    id: "h1",
    contactId: "c1",
    name: "Test Lead",
    phone: "(555) 000-0000",
    setterName: "Alex R.",
    status: "new",
    value: null,
    lostReason: null,
    handedAt: new Date(NOW - 5 * MIN).toISOString(),
    firstOwnerReplyAt: null,
    estimateAt: null,
    jobAt: null,
    followUpAt: null,
    followUpNote: null,
    address: null,
    service: null,
    closedAt: null,
    lastMessage: null,
    lastMessageAt: null,
    unread: 0,
    ...over,
  };
}

describe("isIgnored", () => {
  it("is false for a fresh new handoff inside the window", () => {
    expect(isIgnored(make({ handedAt: new Date(NOW - 5 * MIN).toISOString() }), NOW)).toBe(false);
  });
  it("is true for a new handoff past the threshold with no reply", () => {
    const old = new Date(NOW - (IGNORE_THRESHOLD_MIN + 1) * MIN).toISOString();
    expect(isIgnored(make({ handedAt: old }), NOW)).toBe(true);
  });
  it("is false once the lead has advanced past Handed Off", () => {
    const old = new Date(NOW - 60 * MIN).toISOString();
    expect(isIgnored(make({ status: "estimate_set", handedAt: old }), NOW)).toBe(false);
  });
});

describe("responseMinutes", () => {
  it("returns null when the owner never replied", () => {
    expect(responseMinutes(make({ firstOwnerReplyAt: null }))).toBeNull();
  });
  it("measures handoff -> first owner reply", () => {
    const h = make({
      handedAt: new Date(NOW - 10 * MIN).toISOString(),
      firstOwnerReplyAt: new Date(NOW - 6 * MIN).toISOString(),
    });
    expect(responseMinutes(h)).toBe(4);
  });
});

describe("isClosed", () => {
  it("treats won and lost as terminal", () => {
    expect(isClosed("won")).toBe(true);
    expect(isClosed("lost")).toBe(true);
    expect(isClosed("job_booked")).toBe(false);
    expect(isClosed("later")).toBe(false);
  });
});

describe("funnel", () => {
  it("rolls up counts and revenue across booked + won", () => {
    const list = [
      make({ id: "a", status: "won", value: 8000, handedAt: new Date(NOW - 2 * MIN).toISOString(), estimateAt: new Date(NOW).toISOString() }),
      make({ id: "d", status: "job_booked", value: 5000, handedAt: new Date(NOW - 3 * MIN).toISOString() }),
      make({ id: "b", status: "lost", handedAt: new Date(NOW - 6 * MIN).toISOString() }),
      make({ id: "c", status: "new" }),
    ];
    const f = funnel(list);
    expect(f.handed).toBe(4);
    expect(f.won).toBe(1);
    expect(f.booked).toBe(1);
    expect(f.lost).toBe(1);
    expect(f.estimated).toBe(2); // the won (via estimateAt) + the job_booked
    expect(f.revenue).toBe(8000); // value is captured at Won only
  });
});

describe("lostReasonLabel", () => {
  it("maps keys and blanks null", () => {
    expect(lostReasonLabel("price")).toBe("Price");
    expect(lostReasonLabel(null)).toBe("");
  });
});
