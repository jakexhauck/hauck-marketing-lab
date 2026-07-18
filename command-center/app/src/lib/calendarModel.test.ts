import { describe, it, expect } from "vitest";
import {
  jobToItem,
  filterBySources,
  itemsOnDay,
  groupItemsByDay,
  minutesToLabel,
  packDayColumns,
  CALENDAR_SOURCE_ORDER,
  type CalendarItem,
  type CalendarSource,
} from "./calendarModel";
import type { Job } from "./jobsPipeline";

const baseJob: Job = {
  id: "j6",
  customer: "Tom Willis",
  service: "Full exterior",
  city: "Rochester Hills",
  zip: "48307",
  phone: "(248) 555-0162",
  date: "2026-07-03",
  time: "9:00 AM",
  startMinutes: 540,
  amount: 450,
  status: "booked",
  paid: false,
};

describe("job end times", () => {
  it("carries a job's real end time onto the calendar item", () => {
    const item = jobToItem({ ...baseJob, startMinutes: 540, endMinutes: 690 });
    expect(item.endMinutes).toBe(690);
  });

  it("leaves endMinutes null when the job has no end time", () => {
    expect(jobToItem(baseJob).endMinutes).toBeNull();
  });

  it("lets a real end time drive the packed span instead of the default hour", () => {
    const long = jobToItem({ ...baseJob, startMinutes: 540, endMinutes: 720 });
    const [placed] = packDayColumns([long]);
    expect(placed.end).toBe(720);
  });
});

describe("jobToItem", () => {
  it("maps a booked Job to a job item with amount and location", () => {
    const item = jobToItem(baseJob);
    expect(item.source).toBe("job");
    expect(item.id).toBe("job:j6");
    expect(item.title).toBe("Tom Willis");
    expect(item.subtitle).toBe("Full exterior");
    expect(item.amount).toBe(450);
    expect(item.date).toBe("2026-07-03");
    expect(item.startMinutes).toBe(540);
    expect(item.location).toContain("Rochester Hills");
  });

  it("maps a completed Job to the job source", () => {
    const item = jobToItem({ ...baseJob, status: "completed", paid: true });
    expect(item.source).toBe("job");
  });

  it("maps an estimate Job to the estimate source", () => {
    const item = jobToItem({ ...baseJob, id: "e1", status: "estimate" });
    expect(item.source).toBe("estimate");
    expect(item.id).toBe("job:e1");
  });
});

describe("filterBySources", () => {
  const mk = (source: CalendarSource, id: string): CalendarItem => ({
    id,
    source,
    title: "",
    subtitle: "",
    date: "2026-07-01",
    startMinutes: 0,
    endMinutes: null,
    timeLabel: "",
    status: "",
    amount: null,
    location: "",
    meetingUrl: "",
    contactId: "",
  });
  it("keeps only items whose source is active", () => {
    const items = [mk("estimate", "a"), mk("job", "b")];
    const out = filterBySources(items, new Set(["estimate"]));
    expect(out.map((i) => i.id)).toEqual(["a"]);
  });
});

describe("itemsOnDay", () => {
  const mk = (
    id: string,
    date: string,
    startMinutes: number | null,
  ): CalendarItem => ({
    id,
    source: "job",
    title: "",
    subtitle: "",
    date,
    startMinutes,
    endMinutes: null,
    timeLabel: "",
    status: "",
    amount: null,
    location: "",
    meetingUrl: "",
    contactId: "",
  });
  it("returns that day's items, timed ascending then all-day", () => {
    const items = [
      mk("late", "2026-07-01", 600),
      mk("allday", "2026-07-01", null),
      mk("early", "2026-07-01", 480),
      mk("other", "2026-07-02", 500),
    ];
    expect(itemsOnDay(items, "2026-07-01").map((i) => i.id)).toEqual([
      "early",
      "late",
      "allday",
    ]);
  });
});

describe("groupItemsByDay", () => {
  const mk = (id: string, date: string): CalendarItem => ({
    id,
    source: "job",
    title: "",
    subtitle: "",
    date,
    startMinutes: 100,
    endMinutes: null,
    timeLabel: "",
    status: "",
    amount: null,
    location: "",
    meetingUrl: "",
    contactId: "",
  });
  it("groups by day ascending", () => {
    const groups = groupItemsByDay([
      mk("b", "2026-07-02"),
      mk("a", "2026-07-01"),
    ]);
    expect(groups.map((g) => g.iso)).toEqual(["2026-07-01", "2026-07-02"]);
  });
});

describe("packDayColumns", () => {
  const mk = (id: string, start: number, end: number): CalendarItem => ({
    id,
    source: "job",
    title: id,
    subtitle: "",
    date: "2026-07-02",
    startMinutes: start,
    endMinutes: end,
    timeLabel: "",
    status: "",
    amount: null,
    location: "",
    meetingUrl: "",
    contactId: "",
  });

  it("gives two overlapping items separate lanes with cols=2", () => {
    const placed = packDayColumns([mk("a", 570, 630), mk("b", 600, 660)]);
    const a = placed.find((p) => p.item.id === "a")!;
    const b = placed.find((p) => p.item.id === "b")!;
    expect(a.cols).toBe(2);
    expect(b.cols).toBe(2);
    expect(a.col).not.toBe(b.col);
  });

  it("keeps non-overlapping items full width in separate clusters", () => {
    const placed = packDayColumns([mk("a", 480, 540), mk("b", 600, 660)]);
    expect(placed.every((p) => p.cols === 1 && p.col === 0)).toBe(true);
  });

  it("reuses a freed lane for a later non-overlapping item", () => {
    // a:8-9, b:8-10 (overlap, 2 lanes), c:9:30-10:30 overlaps b only -> lane of a reused
    const placed = packDayColumns([
      mk("a", 480, 540),
      mk("b", 480, 600),
      mk("c", 570, 630),
    ]);
    const cols = placed[0].cols;
    expect(cols).toBe(2);
    const c = placed.find((p) => p.item.id === "c")!;
    expect(c.col).toBe(0);
  });
});

describe("CALENDAR_SOURCE_ORDER", () => {
  it("covers only the two sales streams", () => {
    expect(CALENDAR_SOURCE_ORDER).toEqual(["estimate", "job"]);
  });
});

describe("minutesToLabel", () => {
  it("formats minutes past midnight as a 12h label", () => {
    expect(minutesToLabel(0)).toBe("12:00 AM");
    expect(minutesToLabel(9 * 60 + 30)).toBe("9:30 AM");
    expect(minutesToLabel(13 * 60)).toBe("1:00 PM");
  });
});
