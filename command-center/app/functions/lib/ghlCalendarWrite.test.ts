import { describe, expect, it } from "vitest";
import { buildHoursUpdate, PRESERVED_FIELDS } from "./ghlCalendarWrite";

// The record here is Made Better's "Dialers - Phone Appointment" calendar as
// GHL returned it on 2026-08-13, trimmed. The 15 minute slot duration is the
// value a bare { openHours } PUT silently reset to 30.
const current = {
  id: "dZEelrhk5dYrhJQdz8Lj",
  name: "Dialers - Phone Appointment",
  slotDuration: 15,
  slotDurationUnit: "mins",
  slotInterval: 15,
  slotIntervalUnit: "mins",
  appoinmentPerSlot: 1,
  appoinmentPerDay: 6,
  // Returned by GHL, rejected on write with 422.
  formSubmitRedirectUrl: "",
  teamMembers: [],
};

const hours = [
  {
    daysOfTheWeek: [1],
    hours: [{ openHour: 9, openMinute: 0, closeHour: 17, closeMinute: 0 }],
  },
];

describe("buildHoursUpdate", () => {
  it("carries the slot settings back so GHL cannot default them away", () => {
    const body = buildHoursUpdate(current, hours);
    expect(body.slotDuration).toBe(15);
    expect(body.slotInterval).toBe(15);
    expect(body.appoinmentPerDay).toBe(6);
    expect(body.openHours).toEqual(hours);
  });

  it("sends nothing GHL refuses to be sent", () => {
    // A full echo of the record comes back 422: formSubmitRedirectUrl is not
    // writable and teamMembers may not be empty.
    const body = buildHoursUpdate(current, hours);
    expect(body).not.toHaveProperty("formSubmitRedirectUrl");
    expect(body).not.toHaveProperty("teamMembers");
    expect(body).not.toHaveProperty("id");
    expect(body).not.toHaveProperty("name");
  });

  it("omits a setting the calendar does not carry rather than inventing one", () => {
    const body = buildHoursUpdate({ slotDuration: 30 }, hours);
    for (const key of PRESERVED_FIELDS) {
      if (key !== "slotDuration") expect(body).not.toHaveProperty(key);
    }
  });

  it("writes an empty week when that is what was asked for", () => {
    expect(buildHoursUpdate(current, []).openHours).toEqual([]);
  });
});
