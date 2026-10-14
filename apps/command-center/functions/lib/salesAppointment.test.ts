import { describe, expect, it } from "vitest";
import { pickSalesAppointment } from "./salesAppointment";

const appt = (startTime: string, status = "confirmed", deleted = false) => ({
  id: startTime,
  calendarId: "cal",
  startTime,
  status,
  deleted,
});
const NOW = Date.parse("2026-10-13T12:00:00Z");

describe("pickSalesAppointment", () => {
  it("picks the next upcoming appointment", () => {
    expect(
      pickSalesAppointment(
        [appt("2026-10-20T15:00:00Z"), appt("2026-10-15T15:00:00Z"), appt("2026-10-01T15:00:00Z")],
        NOW,
      ),
    ).toBe("2026-10-15T15:00:00.000Z");
  });

  it("falls back to the latest past one", () => {
    expect(pickSalesAppointment([appt("2026-10-01T15:00:00Z"), appt("2026-10-10T15:00:00Z")], NOW)).toBe(
      "2026-10-10T15:00:00.000Z",
    );
  });

  it("skips cancelled and deleted appointments", () => {
    expect(
      pickSalesAppointment(
        [appt("2026-10-15T15:00:00Z", "cancelled"), appt("2026-10-16T15:00:00Z", "booked", true)],
        NOW,
      ),
    ).toBeNull();
  });

  it("is null with no appointments", () => {
    expect(pickSalesAppointment([], NOW)).toBeNull();
  });
});
