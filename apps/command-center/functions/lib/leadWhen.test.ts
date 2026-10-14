import { describe, expect, it } from "vitest";
import {
  isFollowUpStatus,
  needsAppointmentWhen,
  pickAppointment,
  pickFollowUpTask,
  type WhenEvent,
  type WhenTask,
} from "./leadWhen";

const NOW = Date.parse("2026-07-24T12:00:00Z");

function ev(id: string, startTime: string, extra: Partial<WhenEvent> = {}): WhenEvent {
  return { id, contactId: "c1", startTime, status: "booked", title: "Appt", ...extra };
}

describe("needsAppointmentWhen / isFollowUpStatus", () => {
  it("claims the four booked statuses for an appointment date", () => {
    expect(needsAppointmentWhen("phone_appt_booked")).toBe(true);
    expect(needsAppointmentWhen("phone_appt_confirmed")).toBe(true);
    expect(needsAppointmentWhen("estimate_booked")).toBe(true);
    expect(needsAppointmentWhen("job_booked")).toBe(true);
  });

  it("claims the chasing statuses for a follow-up due date", () => {
    expect(isFollowUpStatus("phone_follow_up")).toBe(true);
    expect(isFollowUpStatus("follow_up")).toBe(true);
    expect(isFollowUpStatus("long_term_nurture")).toBe(true);
  });

  it("leaves the terminal and early statuses without a when", () => {
    for (const s of ["new", "contacted", "handed_off", "won", "lost"] as const) {
      expect(needsAppointmentWhen(s)).toBe(false);
      expect(isFollowUpStatus(s)).toBe(false);
    }
  });
});

describe("pickAppointment", () => {
  it("returns null when the contact has no events", () => {
    expect(pickAppointment([], NOW)).toBeNull();
  });

  it("prefers the soonest upcoming appointment", () => {
    const picked = pickAppointment(
      [
        ev("a", "2026-08-01T15:00:00Z"),
        ev("b", "2026-07-25T15:00:00Z"),
        ev("c", "2026-09-01T15:00:00Z"),
      ],
      NOW,
    );
    expect(picked?.id).toBe("b");
  });

  it("falls back to the most recent past appointment when none are upcoming", () => {
    // A Job Booked lead whose job already happened still deserves its date.
    const picked = pickAppointment(
      [ev("old", "2026-06-01T15:00:00Z"), ev("recent", "2026-07-20T15:00:00Z")],
      NOW,
    );
    expect(picked?.id).toBe("recent");
  });

  it("ignores cancelled appointments", () => {
    const picked = pickAppointment(
      [
        ev("dead", "2026-07-25T15:00:00Z", { status: "cancelled" }),
        ev("live", "2026-07-28T15:00:00Z"),
      ],
      NOW,
    );
    expect(picked?.id).toBe("live");
  });

  it("ignores events with an unparseable start time rather than sorting them first", () => {
    const picked = pickAppointment(
      [ev("junk", "not-a-date"), ev("good", "2026-07-26T15:00:00Z")],
      NOW,
    );
    expect(picked?.id).toBe("good");
  });

  it("returns null when every event is cancelled", () => {
    expect(
      pickAppointment([ev("x", "2026-07-25T15:00:00Z", { status: "cancelled" })], NOW),
    ).toBeNull();
  });
});

describe("pickFollowUpTask", () => {
  function task(id: string, dueDate: string, completed = false): WhenTask {
    return { id, title: "Call back", dueDate, completed };
  }

  it("returns null with no tasks", () => {
    expect(pickFollowUpTask([])).toBeNull();
  });

  it("takes the soonest-due open task", () => {
    const picked = pickFollowUpTask([
      task("late", "2026-08-10T15:00:00Z"),
      task("soon", "2026-07-26T15:00:00Z"),
    ]);
    expect(picked?.id).toBe("soon");
  });

  it("ignores completed tasks", () => {
    const picked = pickFollowUpTask([
      task("done", "2026-07-25T15:00:00Z", true),
      task("open", "2026-07-30T15:00:00Z"),
    ]);
    expect(picked?.id).toBe("open");
  });

  it("returns null when every task is done", () => {
    expect(pickFollowUpTask([task("done", "2026-07-25T15:00:00Z", true)])).toBeNull();
  });

  it("skips tasks with no usable due date", () => {
    const picked = pickFollowUpTask([task("nodate", ""), task("dated", "2026-07-30T15:00:00Z")]);
    expect(picked?.id).toBe("dated");
  });

  it("keeps an overdue task rather than hiding it", () => {
    // An overdue follow-up is the most important one to show, not the least.
    const picked = pickFollowUpTask([task("overdue", "2026-07-01T15:00:00Z")]);
    expect(picked?.id).toBe("overdue");
  });
});
