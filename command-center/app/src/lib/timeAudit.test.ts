import { describe, it, expect } from "vitest";
import {
  LEVERAGE_TIERS,
  TASK_TYPES,
  SLOT_COUNT,
  START_HOUR,
  slotLabel,
  rateForBlock,
  dayTotal,
  weekTotal,
  hoursByLeverage,
  pctHighLeverage,
  weekRollup,
  cycleTaskType,
  mondayOf,
  addWeeks,
  formatWeekRange,
  money,
  type Leverage,
  type TaskType,
  type TimeAuditBlock,
} from "./timeAudit";

// Small builder so the seeds below read like the mockup's span() helper.
function block(dayOfWeek: number, slot: number, taskType: TaskType): TimeAuditBlock {
  const task = TASK_TYPES.find((t) => t.label === taskType)!;
  return { dayOfWeek, slot, leverage: task.defaultLeverage, taskType };
}

function span(dayOfWeek: number, from: number, to: number, taskType: TaskType): TimeAuditBlock[] {
  const out: TimeAuditBlock[] = [];
  for (let s = from; s < to; s++) out.push(block(dayOfWeek, s, taskType));
  return out;
}

describe("config", () => {
  it("exposes the five leverage tiers in order, low to high", () => {
    expect(LEVERAGE_TIERS.map((t) => t.label)).toEqual([
      "Low",
      "Low-Mid",
      "Mid",
      "Mid-High",
      "High",
    ]);
    expect(LEVERAGE_TIERS.map((t) => t.ratePer30m)).toEqual([0, 20, 60, 160, 450]);
  });

  it("renders the two hyphenated tiers with a slash", () => {
    const byLabel = (l: Leverage) => LEVERAGE_TIERS.find((t) => t.label === l)!;
    expect(byLabel("Low-Mid").displayLabel).toBe("Low/Mid");
    expect(byLabel("Mid-High").displayLabel).toBe("Mid/High");
    expect(byLabel("Mid").displayLabel).toBe("Mid");
  });

  it("maps each task type to its default leverage", () => {
    expect(TASK_TYPES.map((t) => [t.label, t.defaultLeverage])).toEqual([
      ["Sales calls", "High"],
      ["Roleplays", "Mid-High"],
      ["Outreach", "Mid"],
      ["Scraping leads", "Low-Mid"],
      ["Admin", "Low-Mid"],
      ["Scrolling", "Low"],
    ]);
  });

  it("covers 6:00 AM to 10:00 PM in 32 half-hour slots", () => {
    expect(SLOT_COUNT).toBe(32);
    expect(START_HOUR).toBe(6);
  });
});

describe("slotLabel", () => {
  it("labels slot 0 as 6:00 AM and marks it an hour start", () => {
    expect(slotLabel(0)).toEqual({ text: "6:00", ampm: "AM", isHourStart: true });
  });

  it("labels slot 1 as 6:30 AM and does not mark it an hour start", () => {
    expect(slotLabel(1)).toEqual({ text: "6:30", ampm: "AM", isHourStart: false });
  });

  it("labels noon as 12:00 PM", () => {
    // 6:00 AM + 12 slots = 12:00 PM
    expect(slotLabel(12)).toEqual({ text: "12:00", ampm: "PM", isHourStart: true });
  });

  it("labels the last slot as 9:30 PM (the block ending at 10:00 PM)", () => {
    expect(slotLabel(SLOT_COUNT - 1)).toEqual({ text: "9:30", ampm: "PM", isHourStart: false });
  });
});

describe("rateForBlock", () => {
  it("returns the tier rate for each leverage", () => {
    const rates: Record<Leverage, number> = {
      Low: 0,
      "Low-Mid": 20,
      Mid: 60,
      "Mid-High": 160,
      High: 450,
    };
    for (const [leverage, rate] of Object.entries(rates)) {
      expect(
        rateForBlock({ dayOfWeek: 0, slot: 0, leverage: leverage as Leverage, taskType: "Admin" }),
      ).toBe(rate);
    }
  });
});

describe("dayTotal", () => {
  it("sums only the blocks on that day", () => {
    const blocks = [
      ...span(0, 0, 2, "Sales calls"), // 2 x 450
      ...span(0, 2, 3, "Outreach"), // 1 x 60
      ...span(1, 0, 4, "Sales calls"), // other day, ignored
    ];
    expect(dayTotal(blocks, 0)).toBe(960);
  });

  it("returns 0 for a day with nothing tagged", () => {
    expect(dayTotal(span(0, 0, 4, "Sales calls"), 3)).toBe(0);
    expect(dayTotal([], 0)).toBe(0);
  });
});

describe("weekTotal", () => {
  it("returns 0 for an untagged week", () => {
    expect(weekTotal([])).toBe(0);
  });

  it("sums a seeded week to a hand-computed figure", () => {
    const blocks = [
      ...span(0, 0, 4, "Sales calls"), // 4 x 450 = 1800
      ...span(1, 0, 2, "Roleplays"), // 2 x 160 = 320
      ...span(2, 0, 3, "Outreach"), // 3 x 60  = 180
      ...span(3, 0, 2, "Scraping leads"), // 2 x 20  = 40
      ...span(4, 0, 1, "Admin"), // 1 x 20  = 20
      ...span(5, 0, 5, "Scrolling"), // 5 x 0   = 0
    ];
    expect(weekTotal(blocks)).toBe(2360);
    expect(blocks.reduce((sum, b) => sum + rateForBlock(b), 0)).toBe(2360);
  });
});

describe("hoursByLeverage", () => {
  it("counts half an hour per block, with every tier present", () => {
    const blocks = [
      ...span(0, 0, 3, "Sales calls"), // High, 1.5h
      ...span(0, 3, 4, "Roleplays"), // Mid-High, 0.5h
      ...span(1, 0, 2, "Scraping leads"), // Low-Mid, 1h
      ...span(1, 2, 3, "Admin"), // Low-Mid too, +0.5h
    ];
    expect(hoursByLeverage(blocks)).toEqual({
      Low: 0,
      "Low-Mid": 1.5,
      Mid: 0,
      "Mid-High": 0.5,
      High: 1.5,
    });
  });

  it("is all zeroes for an untagged week", () => {
    expect(hoursByLeverage([])).toEqual({
      Low: 0,
      "Low-Mid": 0,
      Mid: 0,
      "Mid-High": 0,
      High: 0,
    });
  });
});

describe("pctHighLeverage", () => {
  it("is 0 when nothing is tagged", () => {
    expect(pctHighLeverage([])).toBe(0);
  });

  it("counts only Mid-High and High as high leverage", () => {
    const blocks = [
      ...span(0, 0, 1, "Sales calls"), // High
      ...span(0, 1, 2, "Roleplays"), // Mid-High
      ...span(0, 2, 3, "Outreach"), // Mid, not high
      ...span(0, 3, 4, "Scrolling"), // Low, not high
    ];
    expect(pctHighLeverage(blocks)).toBe(50);
  });

  it("rounds to a whole percent", () => {
    // 1 of 3 tagged blocks is high leverage: 33.33 -> 33
    const blocks = [
      ...span(0, 0, 1, "Sales calls"),
      ...span(0, 1, 3, "Admin"),
    ];
    expect(pctHighLeverage(blocks)).toBe(33);
  });

  it("is 100 when every tagged block is high leverage", () => {
    expect(pctHighLeverage(span(0, 0, 4, "Sales calls"))).toBe(100);
  });
});

describe("weekRollup", () => {
  it("returns per-day totals, the week total, the share and the hours", () => {
    const blocks = [
      ...span(0, 0, 2, "Sales calls"), // 900
      ...span(2, 0, 1, "Outreach"), // 60
    ];
    expect(weekRollup(blocks)).toEqual({
      dayTotals: [900, 0, 60, 0, 0, 0, 0],
      weekTotal: 960,
      pctHighLeverage: 67,
      hoursByLeverage: { Low: 0, "Low-Mid": 0, Mid: 0.5, "Mid-High": 0, High: 1 },
    });
  });

  it("is all zero for an untagged week", () => {
    const rollup = weekRollup([]);
    expect(rollup.dayTotals).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(rollup.weekTotal).toBe(0);
    expect(rollup.pctHighLeverage).toBe(0);
  });
});

describe("cycleTaskType", () => {
  it("walks the full cycle from empty and wraps back to empty", () => {
    expect(cycleTaskType(null)).toBe("Sales calls");
    expect(cycleTaskType("Sales calls")).toBe("Roleplays");
    expect(cycleTaskType("Roleplays")).toBe("Outreach");
    expect(cycleTaskType("Outreach")).toBe("Scraping leads");
    expect(cycleTaskType("Scraping leads")).toBe("Admin");
    expect(cycleTaskType("Admin")).toBe("Scrolling");
    expect(cycleTaskType("Scrolling")).toBe(null);
  });
});

describe("mondayOf", () => {
  it("resolves a mid-week date to that week's Monday", () => {
    // 2026-07-15 is a Wednesday.
    expect(mondayOf("2026-07-15")).toBe("2026-07-13");
  });

  it("leaves a Monday alone", () => {
    expect(mondayOf("2026-07-13")).toBe("2026-07-13");
  });

  it("treats Sunday as the end of its week, not the start", () => {
    // 2026-07-19 is a Sunday.
    expect(mondayOf("2026-07-19")).toBe("2026-07-13");
  });

  it("crosses a month boundary backwards", () => {
    // 2026-07-01 is a Wednesday; its Monday is in June.
    expect(mondayOf("2026-07-01")).toBe("2026-06-29");
  });

  it("uses the local calendar day of a Date, with no timezone drift", () => {
    // Late-evening local time must not roll into the next UTC day.
    expect(mondayOf(new Date(2026, 6, 15, 23, 30))).toBe("2026-07-13");
    expect(mondayOf(new Date(2026, 6, 13, 0, 5))).toBe("2026-07-13");
  });
});

describe("addWeeks", () => {
  it("steps forward and back a week", () => {
    expect(addWeeks("2026-07-13", 1)).toBe("2026-07-20");
    expect(addWeeks("2026-07-13", -1)).toBe("2026-07-06");
  });

  it("crosses month and year boundaries", () => {
    expect(addWeeks("2026-07-27", 1)).toBe("2026-08-03");
    expect(addWeeks("2026-12-28", 1)).toBe("2027-01-04");
  });

  it("crosses a DST change without drifting a day", () => {
    // US DST ends 2026-11-01; a UTC-only calculation is immune to it.
    expect(addWeeks("2026-10-26", 1)).toBe("2026-11-02");
    expect(addWeeks("2026-11-02", -1)).toBe("2026-10-26");
  });

  it("returns the same week for 0", () => {
    expect(addWeeks("2026-07-13", 0)).toBe("2026-07-13");
  });
});

describe("formatWeekRange", () => {
  it("collapses a range inside one month", () => {
    expect(formatWeekRange("2026-07-13")).toBe("Jul 13 – 19");
  });

  it("names both months across a month boundary", () => {
    expect(formatWeekRange("2026-06-29")).toBe("Jun 29 – Jul 5");
  });

  it("names both months across a year boundary", () => {
    expect(formatWeekRange("2026-12-28")).toBe("Dec 28 – Jan 3");
  });
});

describe("money", () => {
  it("formats whole dollars with separators", () => {
    expect(money(0)).toBe("$0");
    expect(money(450)).toBe("$450");
    expect(money(12500)).toBe("$12,500");
  });
});
