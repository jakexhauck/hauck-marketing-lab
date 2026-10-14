import { describe, it, expect } from "vitest";
import {
  isRealBooking,
  parseLookbackDays,
  SCHEDULE_LOOKBACK_DAYS,
  toAppointment,
} from "./capiSchedule";
import { scheduleValue, actionsValue } from "./metaActions";

// A GHL calendar event, shaped like the real one read off Willis's "Phone
// Appointment" calendar on 2026-08-13. Note `appoinmentStatus`: GHL sends the
// misspelling alongside the correct key, and dropping either would let a
// cancelled appointment through as a booking.
function event(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "zu4sKi2hZqcap7TOAj8I",
    calendarId: "Jlr88qZDp0Sth1H5Sjzf",
    contactId: "k2oMSiUkW6EMKpZgrxBL",
    appointmentStatus: "confirmed",
    appoinmentStatus: "confirmed",
    dateAdded: "2026-08-08T00:56:10.000Z",
    dateUpdated: "2026-08-08T00:57:31.000Z",
    startTime: "2026-08-08T12:00:00-04:00",
    endTime: "2026-08-08T12:15:00-04:00",
    title: "Marianne Reeve & Willis Windows | Phone Appointment",
    createdBy: { source: "booking_widget", userId: null },
    deleted: false,
    ...over,
  };
}

describe("isRealBooking", () => {
  it("counts a confirmed appointment", () => {
    expect(isRealBooking(event())).toBe(true);
  });

  it("refuses a cancelled one, however GHL spells the field", () => {
    expect(isRealBooking(event({ appointmentStatus: "cancelled" }))).toBe(false);
    // The misspelled key alone, which is the one that survives on some payloads.
    expect(
      isRealBooking(event({ appointmentStatus: "", appoinmentStatus: "cancelled" })),
    ).toBe(false);
    expect(isRealBooking(event({ appointmentStatus: "canceled" }))).toBe(false);
  });

  it("refuses a no-show and a deleted event", () => {
    expect(isRealBooking(event({ appointmentStatus: "noshow" }))).toBe(false);
    expect(isRealBooking(event({ deleted: true }))).toBe(false);
  });

  it("treats a missing status as booked rather than dropping the booking", () => {
    const e = event();
    delete e.appointmentStatus;
    delete e.appoinmentStatus;
    delete (e as Record<string, unknown>).status;
    expect(isRealBooking(e)).toBe(true);
  });
});

describe("toAppointment", () => {
  it("dates the conversion by dateAdded, never startTime", () => {
    // The single most important line in this module. An estimate booked today
    // for next month carries a startTime weeks in the future; sending that as
    // event_time means Meta rejects the event outright, and if it did not, the
    // booking would be filed against a day the ad had not run.
    const appt = toAppointment(event())!;
    expect(appt.dateAdded).toBe("2026-08-08T00:56:10.000Z");
    expect(appt.startTime).toBe("2026-08-08T12:00:00-04:00");
  });

  it("carries the id, contact and booking source", () => {
    const appt = toAppointment(event())!;
    expect(appt.id).toBe("zu4sKi2hZqcap7TOAj8I");
    expect(appt.contactId).toBe("k2oMSiUkW6EMKpZgrxBL");
    expect(appt.source).toBe("booking_widget");
  });

  it("falls back to dateUpdated when GHL omits dateAdded", () => {
    const e = event();
    delete e.dateAdded;
    expect(toAppointment(e)!.dateAdded).toBe("2026-08-08T00:57:31.000Z");
  });

  it("refuses an event it cannot key, match or date", () => {
    expect(toAppointment(event({ id: "", _id: "" }))).toBeNull();
    expect(toAppointment(event({ contactId: "" }))).toBeNull();
    const undated = event();
    delete undated.dateAdded;
    delete undated.dateUpdated;
    expect(toAppointment(undated)).toBeNull();
  });
});

describe("scheduleValue", () => {
  const a = (t: string, v: string) => ({ action_type: t, value: v });

  it("counts Meta's Schedule roll-up once, not with its components", () => {
    const row = {
      actions: [
        a("schedule", "9"),
        a("offsite_conversion.fb_pixel_schedule", "9"),
      ],
    };
    expect(scheduleValue(row)).toBe(9);
  });

  it("falls back to the components when the roll-up is absent", () => {
    expect(
      scheduleValue({ actions: [a("offsite_conversion.fb_pixel_schedule", "4")] }),
    ).toBe(4);
  });

  it("reads zero for a client whose bookings were never reported to Meta", () => {
    expect(scheduleValue({ actions: [a("lead", "51")] })).toBe(0);
    expect(scheduleValue({})).toBe(0);
  });

  it("never lets a booking inflate the lead count", () => {
    // The reason SCHEDULE_GROUPS is a separate list rather than a fourth entry
    // in ACTION_GROUPS. Folded in, this row would have reported 58 leads.
    const row = { actions: [a("lead", "51"), a("schedule", "7")] };
    expect(actionsValue(row, "actions")).toBe(51);
    expect(scheduleValue(row)).toBe(7);
  });
});

describe("parseLookbackDays", () => {
  it("treats days=0 as zero, not as missing", () => {
    // The whole reason this function exists. `Number("0") || 5` is 5, so a call
    // meant to send nothing sent five days of live conversions into Willis's
    // pixel during this feature's own deploy.
    expect(parseLookbackDays("0")).toBe(0);
  });

  it("falls back to the default when absent, blank or nonsense", () => {
    expect(parseLookbackDays(null)).toBe(SCHEDULE_LOOKBACK_DAYS);
    expect(parseLookbackDays("")).toBe(SCHEDULE_LOOKBACK_DAYS);
    expect(parseLookbackDays("  ")).toBe(SCHEDULE_LOOKBACK_DAYS);
    expect(parseLookbackDays("soon")).toBe(SCHEDULE_LOOKBACK_DAYS);
    // Negative would search into the future and report nothing, silently.
    expect(parseLookbackDays("-3")).toBe(SCHEDULE_LOOKBACK_DAYS);
  });

  it("takes a caller's real window", () => {
    expect(parseLookbackDays("2")).toBe(2);
    expect(parseLookbackDays("7")).toBe(7);
  });
});
