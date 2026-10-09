import { describe, expect, it } from "vitest";
import { pickEstimateCalendars, toEstimateEvents } from "./estimateTracking";

describe("pickEstimateCalendars", () => {
  it("finds Home Estimate and Job among a real client's calendars", () => {
    // Willis Windows' live calendars, 2026-10-09.
    const cals = [
      { id: "1", name: "Job", isActive: true },
      { id: "2", name: "Phone Appointment", isActive: true },
      { id: "3", name: "Phone Appointment - MANUAL BOOKING", isActive: true },
      { id: "4", name: "Home Estimate", isActive: true },
      { id: "5", name: "Window Cleaning Service", isActive: true },
    ];
    const got = pickEstimateCalendars(cals);
    expect(got?.estimate.id).toBe("4");
    expect(got?.job?.id).toBe("1");
  });

  it("returns null with no estimate calendar, and no job calendar when there is none", () => {
    expect(pickEstimateCalendars([{ id: "1", name: "Job" }])).toBeNull();
    expect(pickEstimateCalendars([{ id: "4", name: "In-Home Estimate" }])?.job).toBeNull();
  });

  it("ignores inactive calendars and does not mistake a word containing job", () => {
    const got = pickEstimateCalendars([
      { id: "x", name: "Home Estimate", isActive: false },
      { id: "4", name: "Estimate" },
      { id: "9", name: "Jobsite walk" },
      { id: "1", name: "Jobs" },
    ]);
    expect(got?.estimate.id).toBe("4");
    expect(got?.job?.id).toBe("1");
  });
});

describe("toEstimateEvents", () => {
  it("keeps cancelled estimates, drops deleted and unjoinable ones", () => {
    const got = toEstimateEvents([
      { id: "a", contactId: "c1", startTime: "2026-10-01T14:00:00Z", appointmentStatus: "confirmed" },
      { id: "b", contactId: "c2", startTime: "2026-10-02T14:00:00Z", appointmentStatus: "cancelled" },
      { id: "c", contactId: "c3", deleted: true },
      { id: "d", contactId: "" },
      { _id: "e", contactId: "c5", appoinmentStatus: "noshow" },
    ]);
    expect(got.map((e) => e.contactId)).toEqual(["c1", "c2", "c5"]);
    expect(got[2].status).toBe("noshow");
  });
});
