import { describe, it, expect, beforeEach } from "vitest";
import {
  dialKey,
  dropJudgedCalls,
  isJudged,
  leadKey,
  markJudged,
  resetJudgedDials,
  unmarkJudged,
} from "./judgedDials";

// The race this exists to end: press an outcome, and the eight-second poll that
// was already on its way answers with that dial still pending, putting the card
// the caller just dealt with back on screen mid-call.

const NOW = Date.parse("2026-08-21T15:00:00.000Z");

const CALL = { dialId: "dial-1", leadId: "lead-1" };
const OTHER = { dialId: "dial-2", leadId: "lead-2" };

beforeEach(() => resetJudgedDials());

describe("dropJudgedCalls", () => {
  it("passes every call through when nothing has been judged", () => {
    expect(dropJudgedCalls([CALL, OTHER], NOW)).toEqual([CALL, OTHER]);
  });

  // THE REGRESSION. A poll landing mid-write must not resurrect the card.
  it("hides a judged dial from a poll that still calls it pending", () => {
    markJudged([dialKey("dial-1")], NOW);
    expect(dropJudgedCalls([CALL, OTHER], NOW + 2_000)).toEqual([OTHER]);
  });

  it("hides a judged prospect when the press carried no dial id", () => {
    markJudged([leadKey("lead-1")], NOW);
    expect(dropJudgedCalls([CALL, OTHER], NOW + 2_000)).toEqual([OTHER]);
  });

  it("never hides anybody else", () => {
    markJudged([dialKey("dial-1"), leadKey("lead-1")], NOW);
    expect(dropJudgedCalls([OTHER], NOW + 2_000)).toEqual([OTHER]);
  });

  it("lets the call back through once the tombstone lapses", () => {
    markJudged([dialKey("dial-1")], NOW);
    expect(dropJudgedCalls([CALL], NOW + 31_000)).toEqual([CALL]);
  });

  it("puts the call straight back when the write failed", () => {
    const keys = [dialKey("dial-1"), leadKey("lead-1")];
    markJudged(keys, NOW);
    unmarkJudged(keys);
    expect(dropJudgedCalls([CALL], NOW + 1_000)).toEqual([CALL]);
  });

  it("ignores a null dial id without marking everything", () => {
    markJudged([null, undefined], NOW);
    expect(dropJudgedCalls([CALL, OTHER], NOW)).toEqual([CALL, OTHER]);
  });
});

describe("isJudged", () => {
  it("is false for a key never marked", () => {
    expect(isJudged(dialKey("nope"), NOW)).toBe(false);
  });

  it("is true inside the window and false after it", () => {
    markJudged([dialKey("dial-1")], NOW);
    expect(isJudged(dialKey("dial-1"), NOW + 29_000)).toBe(true);
    expect(isJudged(dialKey("dial-1"), NOW + 30_001)).toBe(false);
  });
});
