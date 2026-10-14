import { describe, it, expect } from "vitest";
import { isUnknownCaller, OUTCOMES, outcomeToStage } from "./callConsole";

describe("isUnknownCaller", () => {
  it("is unknown when name is blank", () => {
    expect(isUnknownCaller("", "(248) 555-0188")).toBe(true);
  });
  it("is unknown when name is just the phone number", () => {
    expect(isUnknownCaller("(248) 555-0188", "(248) 555-0188")).toBe(true);
  });
  it("is known when a real name is present", () => {
    expect(isUnknownCaller("Marcus Bell", "(248) 555-0188")).toBe(false);
  });
});

describe("outcome routing table", () => {
  it("routes Booked the job to Sales Pipeline Job Booked with price", () => {
    const o = outcomeToStage("booked")!;
    expect(o.stageName.toLowerCase()).toContain("job booked");
    expect(o.pipelineName?.toLowerCase()).toContain("sales");
    expect(o.needsPrice).toBe(true);
  });
  it("routes Not qualified to a lost status", () => {
    expect(outcomeToStage("not_qualified")?.status).toBe("lost");
  });
  it("exposes all five outcomes", () => {
    expect(OUTCOMES.map((o) => o.key).sort()).toEqual(
      ["booked", "followup", "no_answer", "not_qualified", "visit"].sort(),
    );
  });
});
