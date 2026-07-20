import { describe, it, expect } from "vitest";
import { validateDialBody } from "./dials";

// validateDialBody is the only pure logic in this route (the rest is a
// Supabase insert), so this covers every 400 path, including the one input
// that would otherwise silently corrupt the Contact rate.

describe("validateDialBody", () => {
  it("rejects an outcome outside the five allowed values", () => {
    const r = validateDialBody({ tenantId: "t", contactId: "c", spoke: true, outcome: "maybe" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("bad_outcome");
  });
  it("accepts each of the five allowed outcomes", () => {
    for (const o of ["booked","not_interested","no_answer","reschedule","bad_lead"]) {
      expect(validateDialBody({ tenantId:"t", contactId:"c", spoke:false, outcome:o }).ok).toBe(true);
    }
  });
  it("requires tenantId and contactId", () => {
    expect(validateDialBody({ contactId: "c", spoke: true, outcome: "booked" }).ok).toBe(false);
    expect(validateDialBody({ tenantId: "t", spoke: true, outcome: "booked" }).ok).toBe(false);
  });
  it("rejects a no_answer that claims someone spoke", () => {
    const r = validateDialBody({ tenantId:"t", contactId:"c", spoke:true, outcome:"no_answer" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("contradictory");
  });
});
