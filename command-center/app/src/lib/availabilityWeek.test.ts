import { describe, it, expect } from "vitest";
import {
  GRID_START_SLOT,
  GRID_END_SLOT,
  addWeeks,
  blocksFor,
  buildWeek,
  coverageIn,
  coveredBy,
  dayHours,
  describeDay,
  peakCoverage,
  rosterHours,
  uncoveredHours,
  unionWeek,
  formatHours,
  gridSlots,
  hasSlot,
  isHourStart,
  normalizeSlots,
  sameSlots,
  setSlot,
  slotLabel,
  weekHours,
  weekLabel,
  weekStart,
  type RosterWeek,
} from "./availabilityWeek";

describe("weekStart", () => {
  it("returns the Monday of the week", () => {
    // 2026-07-27 is a Monday.
    expect(weekStart("2026-07-27")).toBe("2026-07-27");
    expect(weekStart("2026-07-29")).toBe("2026-07-27");
    expect(weekStart("2026-08-02")).toBe("2026-07-27");
  });

  it("treats Sunday as the END of its week, not the start", () => {
    // The trap in every week-start helper: getDay() calls Sunday 0, so a naive
    // subtraction jumps a Sunday forward into the week that has not begun.
    expect(weekStart("2026-08-02")).toBe("2026-07-27");
  });

  it("crosses a month boundary", () => {
    expect(weekStart("2026-08-01")).toBe("2026-07-27");
  });
});

describe("addWeeks", () => {
  it("steps forward and back", () => {
    expect(addWeeks("2026-07-27", 1)).toBe("2026-08-03");
    expect(addWeeks("2026-07-27", -1)).toBe("2026-07-20");
    expect(addWeeks("2026-07-27", 0)).toBe("2026-07-27");
  });

  it("crosses a year boundary", () => {
    expect(addWeeks("2026-12-28", 1)).toBe("2027-01-04");
  });
});

describe("buildWeek", () => {
  const days = buildWeek("2026-07-27", "2026-07-29");

  it("is seven days starting Monday", () => {
    expect(days).toHaveLength(7);
    expect(days[0].iso).toBe("2026-07-27");
    expect(days[0].dowLabel).toBe("Mon");
    expect(days[6].iso).toBe("2026-08-02");
    expect(days[6].dowLabel).toBe("Sun");
  });

  it("flags the weekend as the last two columns", () => {
    expect(days.filter((d) => d.isWeekend).map((d) => d.dowLabel)).toEqual(["Sat", "Sun"]);
  });

  it("flags exactly one today, and every earlier day as past", () => {
    expect(days.filter((d) => d.isToday).map((d) => d.iso)).toEqual(["2026-07-29"]);
    expect(days.filter((d) => d.isPast).map((d) => d.iso)).toEqual([
      "2026-07-27",
      "2026-07-28",
    ]);
  });

  it("marks nothing as today when today falls outside the week", () => {
    const other = buildWeek("2026-07-27", "2026-09-01");
    expect(other.some((d) => d.isToday)).toBe(false);
  });
});

describe("weekLabel", () => {
  it("collapses a shared month", () => {
    expect(weekLabel(buildWeek("2026-07-06", "2026-07-06"))).toBe("Jul 6 - 12, 2026");
  });

  it("names both months when the week crosses one", () => {
    expect(weekLabel(buildWeek("2026-07-27", "2026-07-27"))).toBe("Jul 27 - Aug 2, 2026");
  });

  it("names both years when the week crosses New Year", () => {
    expect(weekLabel(buildWeek("2026-12-28", "2026-12-28"))).toBe("Dec 28 - Jan 3, 2026/2027");
  });
});

describe("slotLabel", () => {
  it("reads as a 12-hour clock", () => {
    expect(slotLabel(16)).toBe("8:00 AM");
    expect(slotLabel(17)).toBe("8:30 AM");
    expect(slotLabel(24)).toBe("12:00 PM");
    expect(slotLabel(26)).toBe("1:00 PM");
    expect(slotLabel(40)).toBe("8:00 PM");
  });

  it("calls midnight 12 AM, not 0 AM", () => {
    expect(slotLabel(0)).toBe("12:00 AM");
  });
});

describe("gridSlots", () => {
  it("covers the drawn window and stops before its end", () => {
    const slots = gridSlots();
    expect(slots[0]).toBe(GRID_START_SLOT);
    expect(slots[slots.length - 1]).toBe(GRID_END_SLOT - 1);
    expect(slots).toHaveLength(GRID_END_SLOT - GRID_START_SLOT);
  });

  it("alternates hour starts", () => {
    expect(isHourStart(16)).toBe(true);
    expect(isHourStart(17)).toBe(false);
  });
});

describe("setSlot", () => {
  it("adds a slot and keeps the day sorted", () => {
    let map = {};
    map = setSlot(map, "2026-07-27", 20, true);
    map = setSlot(map, "2026-07-27", 16, true);
    expect(map).toEqual({ "2026-07-27": [16, 20] });
  });

  it("clears a slot", () => {
    const map = setSlot({ "2026-07-27": [16, 17] }, "2026-07-27", 16, false);
    expect(map).toEqual({ "2026-07-27": [17] });
  });

  it("returns the SAME object when nothing changes", () => {
    // Painting drags across cells that are already in the wanted state; an
    // identity return is what stops each one queueing a pointless save.
    const map = { "2026-07-27": [16] };
    expect(setSlot(map, "2026-07-27", 16, true)).toBe(map);
    expect(setSlot(map, "2026-07-27", 30, false)).toBe(map);
  });

  it("leaves other days untouched", () => {
    const map = setSlot({ "2026-07-27": [16] }, "2026-07-28", 20, true);
    expect(map["2026-07-27"]).toEqual([16]);
    expect(map["2026-07-28"]).toEqual([20]);
  });

  it("clearing the last slot leaves an empty day, not a missing one", () => {
    // An answered "not available" must stay distinguishable from never asked.
    const map = setSlot({ "2026-07-27": [16] }, "2026-07-27", 16, false);
    expect(map["2026-07-27"]).toEqual([]);
    expect("2026-07-27" in map).toBe(true);
  });
});

describe("hasSlot", () => {
  it("is false for an unknown day", () => {
    expect(hasSlot({}, "2026-07-27", 16)).toBe(false);
  });

  it("finds a marked slot", () => {
    expect(hasSlot({ "2026-07-27": [16, 17] }, "2026-07-27", 17)).toBe(true);
    expect(hasSlot({ "2026-07-27": [16, 17] }, "2026-07-27", 18)).toBe(false);
  });
});

describe("hours", () => {
  it("counts half-hour slots as half hours", () => {
    expect(dayHours({ "2026-07-27": [16, 17, 18] }, "2026-07-27")).toBe(1.5);
    expect(dayHours({}, "2026-07-27")).toBe(0);
  });

  it("sums a week", () => {
    const days = buildWeek("2026-07-27", "2026-07-27");
    const map = { "2026-07-27": [16, 17], "2026-07-28": [16, 17, 18, 19] };
    expect(weekHours(map, days)).toBe(3);
  });

  it("formats without a trailing .0", () => {
    expect(formatHours(6)).toBe("6");
    expect(formatHours(6.5)).toBe("6.5");
    expect(formatHours(0)).toBe("0");
  });
});

describe("blocksFor", () => {
  it("merges contiguous slots into one block", () => {
    expect(blocksFor({ d: [16, 17, 18] }, "d")).toEqual([[16, 19]]);
  });

  it("splits on a gap", () => {
    expect(blocksFor({ d: [16, 17, 26, 27] }, "d")).toEqual([
      [16, 18],
      [26, 28],
    ]);
  });

  it("handles unsorted input", () => {
    expect(blocksFor({ d: [18, 16, 17] }, "d")).toEqual([[16, 19]]);
  });

  it("is empty for a blank day", () => {
    expect(blocksFor({}, "d")).toEqual([]);
  });
});

describe("describeDay", () => {
  it("reads as clock ranges", () => {
    expect(describeDay({ d: [16, 17, 18, 26, 27] }, "d")).toBe(
      "8:00 AM - 9:30 AM, 1:00 PM - 2:00 PM",
    );
  });

  it("is empty when nothing is marked", () => {
    expect(describeDay({}, "d")).toBe("");
  });
});

describe("sameSlots", () => {
  it("compares by value", () => {
    expect(sameSlots([16, 17], [16, 17])).toBe(true);
    expect(sameSlots([16, 17], [16, 18])).toBe(false);
    expect(sameSlots([16], [16, 17])).toBe(false);
    expect(sameSlots([], [])).toBe(true);
  });
});

describe("coverage", () => {
  const roster = [
    { id: "z", name: "Zach", days: { "2026-07-27": [16, 17, 18] } },
    { id: "j", name: "Jake", days: { "2026-07-27": [18, 19] } },
  ];
  const days = buildWeek("2026-07-27", "2026-07-27");
  const slots = [16, 17, 18, 19];

  it("names who is on, in roster order", () => {
    expect(coveredBy(roster, "2026-07-27", 16)).toEqual(["Zach"]);
    expect(coveredBy(roster, "2026-07-27", 18)).toEqual(["Zach", "Jake"]);
    expect(coveredBy(roster, "2026-07-27", 19)).toEqual(["Jake"]);
    expect(coveredBy(roster, "2026-07-27", 30)).toEqual([]);
  });

  it("is empty for a day nobody marked", () => {
    expect(coveredBy(roster, "2026-07-28", 16)).toEqual([]);
  });

  it("finds the busiest cell", () => {
    expect(peakCoverage(roster, days, slots)).toBe(2);
  });

  it("peaks at 0 for an empty roster, so nothing divides by it", () => {
    expect(peakCoverage([], days, slots)).toBe(0);
    expect(peakCoverage([{ id: "z", name: "Zach", days: {} }], days, slots)).toBe(0);
  });

  it("counts the hours nobody is on", () => {
    // Four slots drawn across seven days = 28 cells. Monday has all four
    // covered, so 24 cells are empty, which is 12 hours.
    expect(uncoveredHours(roster, days, slots)).toBe(12);
  });

  it("counts the whole window as uncovered when nobody has marked anything", () => {
    expect(uncoveredHours([], days, slots)).toBe(14);
  });

  it("hands back the members in a cell, not just their names", () => {
    expect(coverageIn(roster, "2026-07-27", 18).map((m) => m.id)).toEqual(["z", "j"]);
    expect(coverageIn(roster, "2026-07-27", 16).map((m) => m.id)).toEqual(["z"]);
    expect(coverageIn(roster, "2026-07-27", 30)).toEqual([]);
  });
});

describe("the roster as one week", () => {
  const roster: RosterWeek[] = [
    { id: "z", name: "Zach", days: { "2026-07-27": [16, 17, 18], "2026-07-28": [20] } },
    { id: "j", name: "Jake", days: { "2026-07-27": [18, 19] } },
  ];
  const days = buildWeek("2026-07-27", "2026-07-27");

  it("merges everyone into one marked week", () => {
    expect(unionWeek(roster)).toEqual({
      "2026-07-27": [16, 17, 18, 19],
      "2026-07-28": [20],
    });
  });

  it("counts an overlap once, because a covered half hour is a covered half hour", () => {
    // Zach and Jake are both on at slot 18. Four distinct slots = 2 hours.
    expect(dayHours(unionWeek(roster), "2026-07-27")).toBe(2);
  });

  it("reads as coverage, not as one person's day", () => {
    expect(describeDay(unionWeek(roster), "2026-07-27")).toBe("8:00 AM - 10:00 AM");
  });

  it("is empty for an empty roster", () => {
    expect(unionWeek([])).toEqual({});
    expect(unionWeek([{ id: "z", name: "Zach", days: {} }])).toEqual({});
  });

  it("adds up person-hours separately from covered hours", () => {
    // Zach 3 slots + 1 slot = 2h, Jake 2 slots = 1h. Capacity is 3 person-hours
    // while only 2.5 hours of the week are covered.
    expect(rosterHours(roster, days)).toBe(3);
    expect(weekHours(unionWeek(roster), days)).toBe(2.5);
  });

  it("is 0 person-hours for nobody", () => {
    expect(rosterHours([], days)).toBe(0);
  });
});

describe("normalizeSlots", () => {
  it("sorts and de-duplicates", () => {
    expect(normalizeSlots([20, 16, 20])).toEqual([16, 20]);
  });

  it("drops anything out of range or not a whole slot", () => {
    expect(normalizeSlots([-1, 48, 1.5, "x", null, 16])).toEqual([16]);
  });

  it("accepts numeric strings, since JSON round-trips are not guaranteed", () => {
    expect(normalizeSlots(["16", "17"])).toEqual([16, 17]);
  });

  it("is empty for a non-array", () => {
    expect(normalizeSlots(null)).toEqual([]);
    expect(normalizeSlots("16")).toEqual([]);
  });
});
