import { describe, expect, it } from "vitest";
import { openAppointment } from "./boardBooking";

const a = (id: string, calendarId: string, startTime: string, status = "confirmed", deleted = false) => ({
  id,
  calendarId,
  startTime,
  status,
  deleted,
});

describe("openAppointment", () => {
  it("moves the latest live booking on that calendar, past or future", () => {
    const appts = [
      a("old", "est", "2026-10-01T10:00:00Z"),
      a("new", "est", "2026-10-20T10:00:00Z"),
      a("job", "job", "2026-10-25T10:00:00Z"),
    ];
    expect(openAppointment(appts, "est")?.id).toBe("new");
    expect(openAppointment(appts, "job")?.id).toBe("job");
  });

  it("never moves a cancelled, deleted, showed or no-show booking", () => {
    const appts = [
      a("c", "est", "2026-10-20T10:00:00Z", "cancelled"),
      a("d", "est", "2026-10-21T10:00:00Z", "confirmed", true),
      a("s", "est", "2026-10-22T10:00:00Z", "showed"),
      a("n", "est", "2026-10-23T10:00:00Z", "noshow"),
    ];
    expect(openAppointment(appts, "est")).toBeNull();
  });
});
