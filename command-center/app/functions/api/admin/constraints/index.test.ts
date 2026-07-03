import { describe, expect, it } from "vitest";
import { validatePutBody } from "./index";

// validatePutBody is the only pure logic in this route (everything else is a
// DB round-trip); this covers every 400 path so bad input never reaches
// Supabase and surfaces as a NOT NULL / check-constraint 500 instead.

const validBody = {
  pillar: "delivery",
  title: "Delivery capacity is the system constraint",
  severity: "high",
  metric: "7 accounts",
  detail: "detail",
  impact: "impact",
  isSystem: true,
  throughputVal: "7 / 7",
  throughputLabel: "Live accounts",
  steps: [
    { step: "Identify", action: "Confirm the constraint", owner: "Jake", status: "done", sort: 0 },
    { step: "Exploit", action: "Automate ad-ops", owner: null, status: "doing", sort: 1 },
  ],
};

describe("validatePutBody", () => {
  it("accepts a fully valid body", () => {
    expect(validatePutBody(validBody)).toEqual({ ok: true });
  });

  it("rejects a missing or unknown pillar", () => {
    expect(validatePutBody({ ...validBody, pillar: undefined }).ok).toBe(false);
    expect(validatePutBody({ ...validBody, pillar: "marketing" }).ok).toBe(false);
  });

  it("rejects a missing or blank title", () => {
    expect(validatePutBody({ ...validBody, title: undefined }).ok).toBe(false);
    expect(validatePutBody({ ...validBody, title: "   " }).ok).toBe(false);
  });

  it("rejects an unknown severity", () => {
    expect(validatePutBody({ ...validBody, severity: "critical" }).ok).toBe(false);
  });

  it("rejects an unknown step name", () => {
    expect(
      validatePutBody({
        ...validBody,
        steps: [{ step: "Escalate", action: "x", owner: null, status: "todo", sort: 0 }],
      }).ok,
    ).toBe(false);
  });

  it("rejects a step with no action", () => {
    expect(
      validatePutBody({
        ...validBody,
        steps: [{ step: "Identify", action: "  ", owner: null, status: "todo", sort: 0 }],
      }).ok,
    ).toBe(false);
  });

  it("rejects an unknown step status", () => {
    expect(
      validatePutBody({
        ...validBody,
        steps: [{ step: "Identify", action: "x", owner: null, status: "blocked", sort: 0 }],
      }).ok,
    ).toBe(false);
  });

  it("accepts an empty steps array", () => {
    expect(validatePutBody({ ...validBody, steps: [] })).toEqual({ ok: true });
  });
});
