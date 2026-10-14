import { describe, it, expect } from "vitest";
import type { ClaudeCreate } from "./claude";
import { autoSortMoves, classifyReplies, findSortStages, findTrashStages, pickColdSmsCalendar, prospectZone, replyKey, stateCode, variationOf } from "./coldSmsBoard";

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

describe("auto-sort", () => {
  // The live account on 2026-10-13: negatives and unqualified now leave the
  // Cold SMS board for the Trash pipeline.
  const board = {
    id: "cold",
    name: "Cold SMS ",
    stages: [
      { id: "sent", name: "📨 SMS Sent" },
      { id: "rep", name: "💬 Replied" },
      { id: "pos", name: "✅ Positive Reply" },
      { id: "cna", name: "📱 Call No Answer" },
    ],
  };
  const trash = {
    id: "trash",
    name: "Trash",
    stages: [
      { id: "t-neg", name: "SMS Negative Reply" },
      { id: "t-nr", name: "SMS No Reply" },
      { id: "t-unq", name: "SMS Unqualified" },
    ],
  };
  const pipelines = [board, trash, { id: "sales", name: "Sales", stages: [{ id: "s-unq", name: "Unqualified" }] }];

  it("finds the Trash stages by name", () => {
    expect(findTrashStages(pipelines)).toEqual({ pipelineId: "trash", negative: "t-neg", unqualified: "t-unq" });
    expect(findTrashStages([board])).toBeNull();
  });

  it("sends negatives to Trash and positives up the board", () => {
    expect(findSortStages(board, pipelines)).toEqual({
      replied: "rep",
      positive: { pipelineId: "cold", stageId: "pos" },
      negative: { pipelineId: "trash", stageId: "t-neg" },
    });
  });

  it("still sorts positives with no Trash pipeline", () => {
    expect(findSortStages(board, [board])?.negative).toBeNull();
  });

  it("is null without Replied or Positive Reply", () => {
    const noPos = { ...board, stages: board.stages.filter((s) => s.id !== "pos") };
    expect(findSortStages(noPos, [noPos, trash])).toBeNull();
  });

  it("moves positives up, negatives and stops to Trash, leaves check", () => {
    const sort = findSortStages(board, pipelines)!;
    const moves = autoSortMoves(
      [
        { id: "a", stageId: "rep", verdict: "positive" },
        { id: "b", stageId: "rep", verdict: "negative" },
        { id: "c", stageId: "rep", verdict: "stop" },
        { id: "d", stageId: "rep", verdict: "check" },
        { id: "e", stageId: "rep", verdict: null },
      ],
      sort,
    );
    expect(moves).toEqual([
      { id: "a", pipelineId: "cold", stageId: "pos" },
      { id: "b", pipelineId: "trash", stageId: "t-neg" },
      { id: "c", pipelineId: "trash", stageId: "t-neg" },
    ]);
  });

  it("leaves negatives in Replied when there is no Trash", () => {
    const sort = findSortStages(board, [board])!;
    expect(autoSortMoves([{ id: "b", stageId: "rep", verdict: "negative" }], sort)).toEqual([]);
  });

  it("never touches a card outside Replied", () => {
    const sort = findSortStages(board, pipelines)!;
    expect(
      autoSortMoves(
        [
          { id: "a", stageId: "sent", verdict: "positive" },
          { id: "b", stageId: "pos", verdict: "negative" },
        ],
        sort,
      ),
    ).toEqual([]);
  });
});
