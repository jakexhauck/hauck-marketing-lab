import { describe, expect, it } from "vitest";
import { outcomePushLine } from "./outcomeHandlers";

const Z = "America/Detroit";
const none = { callBackAt: null, attempts: 0 };

describe("outcomePushLine", () => {
  it("names the lead and what happened", () => {
    expect(outcomePushLine("Marcus Bell", { outcome: "estimate_booked", slot: "2026-10-14T10:00:00-04:00", form: { address: "", services: "", notes: "" } }, Z, none)).toBe(
      "Marcus Bell: Estimate booked Wed, Oct 14, 10:00 AM",
    );
    expect(outcomePushLine("Marcus Bell", { outcome: "job_done", amountCents: 420000 }, Z, none)).toBe("Marcus Bell: Job done $4,200");
    expect(outcomePushLine("Marcus Bell", { outcome: "no_answer" }, Z, { callBackAt: null, attempts: 2 })).toBe(
      "Marcus Bell: No answer (2)",
    );
    expect(outcomePushLine("Marcus Bell", { outcome: "not_interested", reason: "Price" }, Z, none)).toBe(
      "Marcus Bell: Not interested: Price",
    );
    expect(outcomePushLine("Marcus Bell", { outcome: "job_cancelled" }, Z, none)).toBe("Marcus Bell: Job cancelled");
  });
});
