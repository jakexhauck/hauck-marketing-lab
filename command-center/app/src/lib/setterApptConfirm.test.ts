import { describe, expect, it } from "vitest";
import {
  CONFIRM_WINDOW_MS,
  appointmentFor,
  confirmState,
  isApptBookedStage,
  isApptConfirmedStage,
  isApptTrackedStage,
} from "./setterApptConfirm";
import type { ApiSetterEvent } from "./api";

const NOW = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;

function event(overrides: Partial<ApiSetterEvent>): ApiSetterEvent {
  return {
    id: "ev1",
    title: "Phone Appointment",
    startTime: new Date(NOW + 48 * HOUR).toISOString(),
    endTime: null,
    status: "booked",
    contactId: "c-1",
    contactName: "Test Lead",
    ...overrides,
  };
}

describe("isApptBookedStage", () => {
  it("matches the live stage name and a spelled-out variant", () => {
    expect(isApptBookedStage("Phone Appt Booked")).toBe(true);
    expect(isApptBookedStage("Phone Appointment Booked")).toBe(true);
  });

  it("does not match confirmed or unrelated stages", () => {
    expect(isApptBookedStage("Phone Appt Confirmed")).toBe(false);
    expect(isApptBookedStage("Survey Follow Up")).toBe(false);
    expect(isApptBookedStage(null)).toBe(false);
  });
});

describe("isApptConfirmedStage / isApptTrackedStage", () => {
  it("matches confirmed stages only", () => {
    expect(isApptConfirmedStage("Phone Appt Confirmed")).toBe(true);
    expect(isApptConfirmedStage("Phone Appointment Confirmed")).toBe(true);
    expect(isApptConfirmedStage("Phone Appt Booked")).toBe(false);
  });

  it("tracks both the booked and confirmed stages", () => {
    expect(isApptTrackedStage("Phone Appt Booked")).toBe(true);
    expect(isApptTrackedStage("Phone Appt Confirmed")).toBe(true);
    expect(isApptTrackedStage("Survey Follow Up")).toBe(false);
  });
});

describe("appointmentFor", () => {
  it("returns the earliest upcoming live booking for the contact", () => {
    const events = [
      event({ id: "far", startTime: new Date(NOW + 72 * HOUR).toISOString() }),
      event({ id: "near", startTime: new Date(NOW + 12 * HOUR).toISOString() }),
      event({ id: "other", contactId: "c-2", startTime: new Date(NOW + HOUR).toISOString() }),
    ];
    expect(appointmentFor("c-1", events, NOW)?.startMs).toBe(NOW + 12 * HOUR);
  });

  it("ignores cancelled and no-show bookings", () => {
    const events = [
      event({ id: "dead", status: "cancelled", startTime: new Date(NOW + HOUR).toISOString() }),
      event({ id: "ns", status: "noshow", startTime: new Date(NOW + 2 * HOUR).toISOString() }),
      event({ id: "live", startTime: new Date(NOW + 5 * HOUR).toISOString() }),
    ];
    expect(appointmentFor("c-1", events, NOW)?.startMs).toBe(NOW + 5 * HOUR);
  });

  it("falls back to the most recent past booking when nothing is ahead", () => {
    const events = [
      event({ id: "old", startTime: new Date(NOW - 50 * HOUR).toISOString() }),
      event({ id: "recent", startTime: new Date(NOW - 2 * HOUR).toISOString() }),
    ];
    expect(appointmentFor("c-1", events, NOW)?.startMs).toBe(NOW - 2 * HOUR);
  });

  it("returns null with no live booking, a missing start, or a foreign contact", () => {
    expect(appointmentFor("c-1", [], NOW)).toBeNull();
    expect(appointmentFor("c-1", [event({ startTime: null })], NOW)).toBeNull();
    expect(appointmentFor("c-9", [event({})], NOW)).toBeNull();
  });
});

describe("confirmState", () => {
  it("is upcoming outside the 24h window", () => {
    expect(
      confirmState({ id: "ev", startMs: NOW + CONFIRM_WINDOW_MS + 1, title: "" }, NOW),
    ).toBe("upcoming");
  });

  it("is due inside the final 24h, boundary inclusive", () => {
    expect(confirmState({ id: "ev", startMs: NOW + CONFIRM_WINDOW_MS, title: "" }, NOW)).toBe(
      "due",
    );
    expect(confirmState({ id: "ev", startMs: NOW + 1, title: "" }, NOW)).toBe("due");
  });

  it("is passed once the start time goes by", () => {
    expect(confirmState({ id: "ev", startMs: NOW, title: "" }, NOW)).toBe("passed");
    expect(confirmState({ id: "ev", startMs: NOW - HOUR, title: "" }, NOW)).toBe("passed");
  });
});
