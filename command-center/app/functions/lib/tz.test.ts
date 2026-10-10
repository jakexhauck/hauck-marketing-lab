import { describe, expect, it } from "vitest";
import { clockZone } from "./tz";

describe("clockZone", () => {
  it("swaps Meta's fixed US zones for the ones that keep daylight saving", () => {
    expect(clockZone("EST")).toBe("America/New_York");
    expect(clockZone("CST")).toBe("America/Chicago");
    expect(clockZone("MST")).toBe("America/Denver");
    expect(clockZone("PST")).toBe("America/Los_Angeles");
    expect(clockZone("EST5EDT")).toBe("America/New_York");
  });

  it("leaves region zones alone", () => {
    expect(clockZone("America/Detroit")).toBe("America/Detroit");
    expect(clockZone(" America/Chicago ")).toBe("America/Chicago");
  });

  it("falls back when there is no zone", () => {
    expect(clockZone(null, "America/New_York")).toBe("America/New_York");
    expect(clockZone("", "America/Chicago")).toBe("America/Chicago");
  });

  it("puts a 10:00 Willis slot at 10:00 Detroit time in October", () => {
    const ms = Date.parse("2026-10-12T14:00:00Z");
    const shown = new Intl.DateTimeFormat("en-US", { timeZone: clockZone("EST"), hour: "numeric" }).format(ms);
    expect(shown).toBe("10 AM");
  });
});
