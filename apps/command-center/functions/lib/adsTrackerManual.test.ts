import { describe, it, expect } from "vitest";
import { hasLiveAppointment, manualLevel } from "./adsTrackerResponse";
import type { WhenEvent } from "./leadWhen";

const NOW = Date.parse("2026-08-12T15:00:00.000Z");

function event(over: Partial<WhenEvent> = {}): WhenEvent {
  return {
    id: "ev1",
    contactId: "c1",
    startTime: "2026-08-20T14:00:00.000Z",
    status: "booked",
    title: "Window Cleaning",
    ...over,
  };
}

describe("hasLiveAppointment", () => {
  it("counts a future booking and a past one", () => {
    expect(hasLiveAppointment([event()], NOW)).toBe(true);
    expect(hasLiveAppointment([event({ startTime: "2026-07-01T14:00:00.000Z" })], NOW)).toBe(true);
  });

  it("does not count a cancelled one, or nothing at all", () => {
    expect(hasLiveAppointment([event({ status: "cancelled" })], NOW)).toBe(false);
    expect(hasLiveAppointment([], NOW)).toBe(false);
  });
});

describe("manualLevel", () => {
  it("puts each typed status on the right rung", () => {
    expect(manualLevel("new", false)).toBe("lead");
    expect(manualLevel("contacted", false)).toBe("pickup");
    expect(manualLevel("follow_up", false)).toBe("pickup");
    expect(manualLevel("appointment_booked", false)).toBe("booking");
    expect(manualLevel("quoted", false)).toBe("booking");
    expect(manualLevel("won", false)).toBe("sale");
  });

  // Pickup rate is the number that tells a client whether their leads answer
  // the phone. Counting a lead that never picked up as a pickup would flatter
  // exactly the figure they are using to judge the ads.
  it("does not count a no-answer as contact made", () => {
    expect(manualLevel("no_answer", false)).toBe("lead");
  });

  // The one that stops the dashboard going backwards. Only the CURRENT status
  // is stored, so without this a lead booked in February and marked Lost in
  // March would take February's booking with it, and the client would watch
  // their Bookings figure fall while they worked.
  it("keeps a real appointment counted as a booking whatever was typed after", () => {
    expect(manualLevel("lost", true)).toBe("booking");
    expect(manualLevel("no_answer", true)).toBe("booking");
    expect(manualLevel("contacted", true)).toBe("booking");
  });

  // Won still outranks the calendar: a paying customer is a sale, not a booking.
  it("keeps a win above a booking", () => {
    expect(manualLevel("won", true)).toBe("sale");
  });

  // A lead lost before anybody reached them is a lead, not a pickup. There is
  // no history to consult, so the honest answer is the lowest rung.
  it("reads a lost lead with no appointment as just a lead", () => {
    expect(manualLevel("lost", false)).toBe("lead");
  });
});
