import { describe, it, expect } from "vitest";
import { DEMO_APPOINTMENTS, DEMO_SOCIAL, DEMO_CAMPAIGNS } from "./calendarDemo";

describe("demo calendar datasets", () => {
  it("are all anchored to late June / July 2026", () => {
    for (const item of [
      ...DEMO_APPOINTMENTS,
      ...DEMO_SOCIAL,
      ...DEMO_CAMPAIGNS,
    ]) {
      expect(
        item.date.startsWith("2026-07-") || item.date.startsWith("2026-06-"),
      ).toBe(true);
    }
  });
  it("carry the right source and a stable id namespace", () => {
    expect(
      DEMO_APPOINTMENTS.every(
        (i) => i.source === "appointment" && i.id.startsWith("appointment:"),
      ),
    ).toBe(true);
    expect(
      DEMO_SOCIAL.every(
        (i) => i.source === "social" && i.id.startsWith("social:"),
      ),
    ).toBe(true);
    expect(
      DEMO_CAMPAIGNS.every(
        (i) => i.source === "campaign" && i.id.startsWith("campaign:"),
      ),
    ).toBe(true);
  });
});
