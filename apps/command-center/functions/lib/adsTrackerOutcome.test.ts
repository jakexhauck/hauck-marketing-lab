import { describe, expect, it } from "vitest";
import { awaitingOutcome } from "./adsTrackerResponse";

describe("awaitingOutcome", () => {
  it("flags a board lead still on Lead with no outcome logged", () => {
    expect(awaitingOutcome({ name: "Lead", key: "lead" }, false)).toBe(true);
  });

  it("clears once the owner logs any outcome", () => {
    expect(awaitingOutcome({ name: "Lead", key: "lead" }, true)).toBe(false);
  });

  it("leaves a lead moved on the board alone", () => {
    for (const key of ["estimate", "job", "won", "followUp", "noAnswer", "nurture", "lost"] as const) {
      expect(awaitingOutcome({ name: key, key }, false)).toBe(false);
    }
  });

  it("never applies to a client off the board pipeline", () => {
    expect(awaitingOutcome(null, false)).toBe(false);
    expect(awaitingOutcome(undefined, false)).toBe(false);
  });
});
