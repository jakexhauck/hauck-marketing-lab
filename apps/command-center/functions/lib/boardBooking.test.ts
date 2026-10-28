import { describe, expect, it, vi } from "vitest";
import { bookOnCalendar, openAppointment } from "./boardBooking";
import { loadEstimateCalendars } from "./estimateTracking";
import { fetchContactAppointments } from "./estimateOutcomeGhl";
import { createAppointment, getCalendar, rescheduleAppointment } from "../api/lib/appointments";

// GHL is faked one level down, at the modules bookOnCalendar calls, so its own
// create-or-move choice still runs.
vi.mock("./estimateTracking", () => ({ loadEstimateCalendars: vi.fn() }));
vi.mock("./estimateOutcomeGhl", () => ({ fetchContactAppointments: vi.fn() }));
vi.mock("../api/lib/appointments", () => ({
  createAppointment: vi.fn(),
  getCalendar: vi.fn(),
  rescheduleAppointment: vi.fn(),
}));

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

describe("bookOnCalendar", () => {
  const GCTX = { token: "tok", locationId: "loc" };
  const SLOT = "2026-10-29T13:00:00-05:00";
  const input = { kind: "estimate" as const, contactId: "k1", name: "Hayden Gillim", slot: SLOT };
  const setup = (appts: ReturnType<typeof a>[]) => {
    vi.mocked(loadEstimateCalendars).mockResolvedValue({ estimate: { id: "est", name: "Home Estimate" }, job: null } as never);
    vi.mocked(getCalendar).mockResolvedValue({ id: "est", slotDuration: 45, slotDurationUnit: "mins" });
    vi.mocked(fetchContactAppointments).mockResolvedValue(appts);
  };

  // What the client's Google Calendar copy is written from (Jake, 2026-10-28:
  // every estimate booked in the app shows on the owner's own calendar).
  it("hands back the new booking's id, title and times", async () => {
    setup([]);
    vi.mocked(createAppointment).mockResolvedValue({ ok: true, id: "ap1" } as never);
    expect(await bookOnCalendar(GCTX, input)).toEqual({
      ok: true,
      appointmentId: "ap1",
      title: "Estimate: Hayden Gillim",
      startIso: SLOT,
      endIso: "2026-10-29T18:45:00.000Z",
    });
  });

  it("hands back the moved booking the same way", async () => {
    setup([a("old", "est", "2026-10-20T10:00:00Z")]);
    vi.mocked(rescheduleAppointment).mockResolvedValue({ ok: true });
    expect(await bookOnCalendar(GCTX, input)).toMatchObject({ ok: true, appointmentId: "old", startIso: SLOT });
  });
});
