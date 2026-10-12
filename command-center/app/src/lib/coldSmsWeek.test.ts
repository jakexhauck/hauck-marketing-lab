import { describe, it, expect } from "vitest";
import { dayKeyOf, formatTime, hourOf, isOffHours, weekOf, zonedTimeToMs, zoneShort } from "./coldSmsWeek";

const NY = "America/New_York";
const CHI = "America/Chicago";

describe("zonedTimeToMs", () => {
  it("turns a New York wall time into the right instant", () => {
    // 14 Oct 2026 is daylight time, UTC-4.
    expect(new Date(zonedTimeToMs(NY, 2026, 10, 14, 14, 30)).toISOString()).toBe("2026-10-14T18:30:00.000Z");
  });
  it("handles the November changeover", () => {
    // 2 Nov 2026 is standard time, UTC-5.
    expect(new Date(zonedTimeToMs(NY, 2026, 11, 2, 9)).toISOString()).toBe("2026-11-02T14:00:00.000Z");
  });
});

describe("weekOf", () => {
  it("runs Monday to Sunday around the given day", () => {
    const wed = Date.parse("2026-10-14T16:00:00Z");
    const days = weekOf(wed, NY);
    expect(days.map((d) => d.key)).toEqual([
      "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18",
    ]);
    expect(days[0].weekday).toBe(1);
    expect(new Date(days[0].start).toISOString()).toBe("2026-10-12T04:00:00.000Z");
  });
  it("steps whole weeks", () => {
    const wed = Date.parse("2026-10-14T16:00:00Z");
    expect(weekOf(wed, NY, 1)[0].key).toBe("2026-10-19");
  });
  it("a Sunday belongs to the week that started the Monday before", () => {
    const sun = Date.parse("2026-10-18T15:00:00Z");
    expect(weekOf(sun, NY)[0].key).toBe("2026-10-12");
  });
});

describe("zone formatting", () => {
  const t = Date.parse("2026-10-14T18:30:00Z");
  it("reads one instant in two zones", () => {
    expect(formatTime(t, NY)).toBe("2:30 PM");
    expect(formatTime(t, CHI)).toBe("1:30 PM");
    expect(hourOf(t, NY)).toBe(14.5);
    expect(dayKeyOf(t, NY)).toBe("2026-10-14");
  });
  it("short US zone names drop the daylight letter", () => {
    expect(zoneShort(NY, t)).toBe("ET");
    expect(zoneShort(CHI, t)).toBe("CT");
  });
  it("flags early and late for the prospect", () => {
    expect(isOffHours(Date.parse("2026-10-14T13:00:00Z"), "America/Los_Angeles")).toBe(true); // 6am PT
    expect(isOffHours(t, CHI)).toBe(false);
  });
});
