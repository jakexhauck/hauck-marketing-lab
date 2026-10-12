import { describe, it, expect } from "vitest";
import type { ClaudeCreate } from "./claude";
import { classifyReplies, pickColdSmsCalendar, prospectZone, replyKey, stateCode, variationOf } from "./coldSmsBoard";

const answer = (obj: unknown): ClaudeCreate => async () => ({
  stop_reason: "end_turn",
  content: [{ type: "text", text: JSON.stringify(obj) }],
});

describe("variationOf", () => {
  it("finds the sms tag among others", () => {
    expect(variationOf(["garage door sms", "sms v2"])).toBe("sms v2");
    expect(variationOf(["SMS V3"])).toBe("sms v3");
  });
  it("is null without one", () => {
    expect(variationOf(["garage door sms"])).toBeNull();
    expect(variationOf(undefined)).toBeNull();
  });
});

describe("prospectZone", () => {
  it("prefers the contact's own timezone", () => {
    expect(prospectZone({ timezone: "America/Denver", state: "TX", phone: "3135550100" })).toEqual({
      zone: "America/Denver",
      source: "contact",
    });
  });
  it("falls back to the state, abbreviated or spelled out", () => {
    expect(prospectZone({ state: "TX" })).toEqual({ zone: "America/Chicago", source: "state" });
    expect(prospectZone({ state: "California" })).toEqual({ zone: "America/Los_Angeles", source: "state" });
  });
  it("ignores a junk timezone and uses the area code last", () => {
    expect(prospectZone({ timezone: "Mars/Base", phone: "+1 (214) 555-0101" })).toEqual({
      zone: "America/Chicago",
      source: "area_code",
    });
  });
  it("says unknown rather than guessing", () => {
    expect(prospectZone({ phone: "12" })).toEqual({ zone: null, source: null });
  });
  it("stateCode rejects non-states", () => {
    expect(stateCode("ZZ")).toBeNull();
    expect(stateCode("new york")).toBe("NY");
  });
});

describe("replyKey", () => {
  it("normalises epoch and ISO to the same key", () => {
    expect(replyKey(1760000000000)).toBe("1760000000000");
    expect(replyKey(new Date(1760000000000).toISOString())).toBe("1760000000000");
    expect(replyKey(null)).toBeNull();
    expect(replyKey("nope")).toBeNull();
  });
});

describe("classifyReplies", () => {
  const items = [
    { key: "a", reply: "how much?" },
    { key: "b", reply: "STOP" },
  ];

  it("returns one verdict per asked key", async () => {
    const r = await classifyReplies(
      { ANTHROPIC_API_KEY: "k" },
      items,
      answer({ results: [{ key: "a", verdict: "positive" }, { key: "b", verdict: "stop" }] }),
    );
    expect(r).toEqual([
      { key: "a", verdict: "positive" },
      { key: "b", verdict: "stop" },
    ]);
  });

  it("drops keys nobody asked about and duplicates", async () => {
    const r = await classifyReplies(
      { ANTHROPIC_API_KEY: "k" },
      items,
      answer({ results: [{ key: "a", verdict: "negative" }, { key: "a", verdict: "positive" }, { key: "z", verdict: "stop" }] }),
    );
    expect(r).toEqual([{ key: "a", verdict: "negative" }]);
  });

  it("labels nothing when Claude's answer is malformed", async () => {
    const r = await classifyReplies({ ANTHROPIC_API_KEY: "k" }, items, answer({ results: [{ key: "a", verdict: "great" }] }));
    expect(r).toEqual([]);
  });

  it("skips the call for an empty batch", async () => {
    let called = false;
    const r = await classifyReplies({ ANTHROPIC_API_KEY: "k" }, [], async () => {
      called = true;
      throw new Error("no");
    });
    expect(r).toEqual([]);
    expect(called).toBe(false);
  });
});

describe("pickColdSmsCalendar", () => {
  it("prefers a Cold SMS calendar", () => {
    expect(pickColdSmsCalendar([{ name: "Hauck Marketing Demo Call" }, { name: "Demo Call - Cold SMS" }])?.name).toBe(
      "Demo Call - Cold SMS",
    );
  });
  it("falls back to the demo calendar, never Onboarding", () => {
    expect(pickColdSmsCalendar([{ name: "Onboarding Call" }, { name: "Hauck Marketing Demo Call" }])?.name).toBe(
      "Hauck Marketing Demo Call",
    );
    expect(pickColdSmsCalendar([{ name: "Onboarding Call" }])).toBeNull();
  });
});
