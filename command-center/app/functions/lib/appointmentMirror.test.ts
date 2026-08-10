import { describe, expect, it } from "vitest";
import { readMirrorFields } from "./appointmentMirror";
import { isCalendarCronRequest } from "./calendarCron";

describe("readMirrorFields", () => {
  it("reads a nested marketplace payload", () => {
    expect(
      readMirrorFields({
        type: "AppointmentCreate",
        appointment: {
          id: "appt_1",
          title: "Home estimate",
          startTime: "2026-08-11T14:00:00Z",
          endTime: "2026-08-11T15:00:00Z",
          address: "12 Elm St",
        },
      }),
    ).toEqual({
      appointmentId: "appt_1",
      title: "Home estimate",
      startIso: "2026-08-11T14:00:00Z",
      endIso: "2026-08-11T15:00:00Z",
      location: "12 Elm St",
    });
  });

  it("reads a flattened workflow payload", () => {
    const out = readMirrorFields({
      type: "AppointmentCreate",
      id: "appt_2",
      startTime: "2026-08-11T14:00:00Z",
      endTime: "2026-08-11T15:00:00Z",
    });
    expect(out?.appointmentId).toBe("appt_2");
    expect(out?.title).toBe("Appointment");
    expect(out?.location).toBeUndefined();
  });

  it("skips rather than guesses when a time is missing", () => {
    // A mirrored event at the wrong time is worse than no mirrored event: the
    // owner plans their day around it.
    expect(
      readMirrorFields({ type: "AppointmentCreate", id: "a", startTime: "2026-08-11T14:00:00Z" }),
    ).toBeNull();
  });

  it("skips when there is no id to update or delete by", () => {
    expect(
      readMirrorFields({
        type: "AppointmentCreate",
        startTime: "2026-08-11T14:00:00Z",
        endTime: "2026-08-11T15:00:00Z",
      }),
    ).toBeNull();
  });
});

describe("isCalendarCronRequest", () => {
  const secret = "a".repeat(32);

  it("admits the scheduler on the exact path with the right secret", () => {
    expect(isCalendarCronRequest("POST", "/api/admin/calendar/sync", secret, secret)).toBe(true);
  });

  it("refuses an unset secret rather than matching everything", () => {
    expect(isCalendarCronRequest("POST", "/api/admin/calendar/sync", "", "")).toBe(false);
    expect(isCalendarCronRequest("POST", "/api/admin/calendar/sync", secret, undefined)).toBe(false);
  });

  it("refuses a secret short enough to be typed by hand", () => {
    expect(isCalendarCronRequest("POST", "/api/admin/calendar/sync", "short", "short")).toBe(false);
  });

  it("refuses any other path, prefix or not", () => {
    // One exact pathname, never a prefix: a prefix rule is the thing somebody
    // widens in a hurry, and the routes next door read every credential we hold.
    expect(isCalendarCronRequest("POST", "/api/admin/calendar/sync/x", secret, secret)).toBe(false);
    expect(isCalendarCronRequest("POST", "/api/admin/secrets", secret, secret)).toBe(false);
  });

  it("refuses any method but POST", () => {
    expect(isCalendarCronRequest("GET", "/api/admin/calendar/sync", secret, secret)).toBe(false);
  });

  it("refuses a wrong secret of the same length", () => {
    expect(isCalendarCronRequest("POST", "/api/admin/calendar/sync", "b".repeat(32), secret)).toBe(
      false,
    );
  });
});
