import { describe, it, expect } from "vitest";
import {
  appointmentToItem,
  jobToItem,
  filterBySources,
  itemsOnDay,
  groupItemsByDay,
  minutesToLabel,
  type CalendarItem,
  type CalendarSource,
} from "./calendarModel";
import type { ApiCalendarEvent } from "./api";
import type { Job } from "./jobsPipeline";

const ev: ApiCalendarEvent = {
  id: "e1",
  title: "Intro call",
  startTime: "2026-07-01T13:30:00-04:00",
  endTime: "2026-07-01T14:00:00-04:00",
  status: "confirmed",
  contactId: "c1",
  contactName: "Marcus Cho",
  address: "",
  meetingUrl: "https://zoom.us/x",
  notes: "",
};

describe("appointmentToItem", () => {
  it("maps a GHL event to an appointment item in the given timezone", () => {
    const item = appointmentToItem(ev, "America/New_York");
    expect(item.source).toBe("appointment");
    expect(item.id).toBe("appointment:e1");
    expect(item.date).toBe("2026-07-01");
    expect(item.startMinutes).toBe(13 * 60 + 30);
    expect(item.timeLabel).toBe("1:30 PM");
    expect(item.subtitle).toBe("Marcus Cho");
    expect(item.contactId).toBe("c1");
  });

  it("treats a null startTime as all-day", () => {
    const item = appointmentToItem(
      { ...ev, startTime: null, endTime: null },
      null,
    );
    expect(item.startMinutes).toBeNull();
    expect(item.timeLabel).toBe("");
    expect(item.date).toBe("");
  });
});

describe("jobToItem", () => {
  it("maps a Job to a job item with amount and location", () => {
    const job: Job = {
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
    const item = jobToItem(job);
    expect(item.source).toBe("job");
    expect(item.id).toBe("job:j6");
    expect(item.title).toBe("Tom Willis");
    expect(item.subtitle).toBe("Full exterior");
    expect(item.amount).toBe(450);
    expect(item.date).toBe("2026-07-03");
    expect(item.startMinutes).toBe(540);
    expect(item.location).toContain("Rochester Hills");
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
    const items = [mk("appointment", "a"), mk("job", "b"), mk("social", "c")];
    const out = filterBySources(items, new Set(["appointment", "social"]));
    expect(out.map((i) => i.id)).toEqual(["a", "c"]);
  });
});

describe("itemsOnDay", () => {
  const mk = (
    id: string,
    date: string,
    startMinutes: number | null,
  ): CalendarItem => ({
    id,
    source: "appointment",
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

describe("minutesToLabel", () => {
  it("formats minutes past midnight as a 12h label", () => {
    expect(minutesToLabel(0)).toBe("12:00 AM");
    expect(minutesToLabel(9 * 60 + 30)).toBe("9:30 AM");
    expect(minutesToLabel(13 * 60)).toBe("1:00 PM");
  });
});
