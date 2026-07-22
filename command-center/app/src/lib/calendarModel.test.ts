import { describe, it, expect } from "vitest";
import {
  jobToItem,
  filterBySources,
  itemsOnDay,
  groupItemsByDay,
  minutesToLabel,
  packDayColumns,
  busyToItem,
  appointmentToItem,
  splitBusy,
  CALENDAR_SOURCE_META,
  CALENDAR_SOURCE_ORDER,
  type CalendarItem,
  type CalendarSource,
} from "./calendarModel";
import { toIso, type Job } from "./jobsPipeline";

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

describe("busy items", () => {
  const iv = { start: "2026-07-20T09:00:00-04:00", end: "2026-07-20T10:30:00-04:00" };

  it("maps a busy interval onto a calendar item", () => {
    const item = busyToItem(iv, 0);
    expect(item.source).toBe("busy");
    expect(item.title).toBe("Busy");
    expect(item.date).toBe("2026-07-20");
    expect(item.startMinutes).toBe(540);
    expect(item.endMinutes).toBe(630);
    expect(item.id).toBe("busy:0");
  });

  it("never leaks event detail onto a busy item", () => {
    const item = busyToItem(iv, 1);
    expect(item.subtitle).toBe("");
    expect(item.amount).toBeNull();
    expect(item.location).toBe("");
    expect(item.contactId).toBe("");
    expect(item.meetingUrl).toBe("");
  });

  it("survives a malformed interval instead of throwing", () => {
    const item = busyToItem({ start: "nonsense", end: "" }, 2);
    expect(item.date).toBe("");
    expect(item.startMinutes).toBeNull();
  });

  it("keeps busy items out of lane packing so jobs are not squashed", () => {
    const job = jobToItem({ ...baseJob, date: "2026-07-20", startMinutes: 540 });
    const busy = busyToItem(
      { start: "2026-07-20T09:00:00-04:00", end: "2026-07-20T17:00:00-04:00" },
      0,
    );
    const placed = packDayColumns([job, busy]);
    expect(placed).toHaveLength(1);
    expect(placed[0].item.source).not.toBe("busy");
    // The regression this guards: a full personal calendar must not shrink the
    // real jobs into slivers by stealing lanes.
    expect(placed[0].cols).toBe(1);
  });

  it("splits busy from the rest", () => {
    const out = splitBusy([jobToItem(baseJob), busyToItem(iv, 0)]);
    expect(out.busy).toHaveLength(1);
    expect(out.rest).toHaveLength(1);
    expect(out.rest[0].source).not.toBe("busy");
  });

  it("is filterable like any other source, so the legend can hide it", () => {
    const items = [jobToItem(baseJob), busyToItem(iv, 0)];
    const shown = filterBySources(items, new Set<CalendarSource>(["job"]));
    expect(shown).toHaveLength(1);
    expect(shown[0].source).toBe("job");
  });

  it("is in the source order and has display metadata", () => {
    expect(CALENDAR_SOURCE_ORDER).toContain("busy");
    expect(CALENDAR_SOURCE_META.busy.label).toBe("Busy");
  });
});

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
  it("still carries exactly two sales streams, and they come first", () => {
    // The surface is the client's sales work. Neither busy nor appointment is
    // a stream of that work: busy is background context from the client's own
    // linked calendar, and appointment belongs to the Setter Suite. Neither
    // may outrank a real estimate or job.
    expect(
      CALENDAR_SOURCE_ORDER.filter((s) => s !== "busy" && s !== "appointment"),
    ).toEqual(["estimate", "job"]);
  });

  it("puts busy last", () => {
    expect(CALENDAR_SOURCE_ORDER).toEqual([
      "estimate",
      "job",
      "appointment",
      "busy",
    ]);
  });

  it("orders appointment ahead of busy so blocks sit above bands", () => {
    expect(CALENDAR_SOURCE_ORDER.indexOf("appointment")).toBeLessThan(
      CALENDAR_SOURCE_ORDER.indexOf("busy"),
    );
  });
});

describe("appointmentToItem", () => {
  it("maps a booked GHL appointment onto a timed calendar item", () => {
    const item = appointmentToItem({
      id: "e1",
      title: "Estimate",
      startTime: "2026-07-24T13:00:00.000Z",
      endTime: "2026-07-24T14:00:00.000Z",
      status: "confirmed",
      contactId: "k1",
      contactName: "Tom Beckett",
    });
    expect(item.id).toBe("appointment:e1");
    expect(item.source).toBe("appointment");
    // The contact is the useful headline for a setter, not the calendar name.
    expect(item.title).toBe("Tom Beckett");
    expect(item.subtitle).toBe("Estimate");
    expect(item.contactId).toBe("k1");
    expect(item.status).toBe("confirmed");
    expect(item.endMinutes! - item.startMinutes!).toBe(60);
  });

  it("falls back to the event title when the contact has no name", () => {
    const item = appointmentToItem({
      id: "e2",
      title: "Phone consultation",
      startTime: "2026-07-24T09:00:00.000Z",
      endTime: "2026-07-24T09:30:00.000Z",
      status: "booked",
      contactId: "",
      contactName: "",
    });
    expect(item.title).toBe("Phone consultation");
    expect(item.subtitle).toBe("");
  });

  it("survives an appointment with no times rather than throwing", () => {
    const item = appointmentToItem({
      id: "e3",
      title: "Broken",
      startTime: null,
      endTime: null,
      status: "booked",
      contactId: "",
      contactName: "",
    });
    expect(item.startMinutes).toBeNull();
    expect(item.endMinutes).toBeNull();
    expect(item.date).toBe("");
  });

  it("dates the item by local wall clock, matching the minutes it reports", () => {
    // Regression guard: the date and the minutes must come off the same local
    // Date, or an evening UTC timestamp lands on the wrong day column.
    const iso = "2026-07-24T13:00:00.000Z";
    const item = appointmentToItem({
      id: "e4",
      title: "Estimate",
      startTime: iso,
      endTime: null,
      status: "booked",
      contactId: "",
      contactName: "",
    });
    expect(item.date).toBe(toIso(new Date(iso)));
    expect(item.timeLabel).toBe(minutesToLabel(item.startMinutes!));
  });

  it("is filterable and has display metadata like any other source", () => {
    expect(CALENDAR_SOURCE_META.appointment.label).toBe("Appointment");
    const items = [
      jobToItem(baseJob),
      appointmentToItem({
        id: "e5",
        title: "Estimate",
        startTime: "2026-07-24T13:00:00.000Z",
        endTime: null,
        status: "booked",
        contactId: "",
        contactName: "",
      }),
    ];
    const shown = filterBySources(items, new Set<CalendarSource>(["appointment"]));
    expect(shown).toHaveLength(1);
    expect(shown[0].source).toBe("appointment");
  });
});

describe("minutesToLabel", () => {
  it("formats minutes past midnight as a 12h label", () => {
    expect(minutesToLabel(0)).toBe("12:00 AM");
    expect(minutesToLabel(9 * 60 + 30)).toBe("9:30 AM");
    expect(minutesToLabel(13 * 60)).toBe("1:00 PM");
  });
});
