import { describe, it, expect } from "vitest";
import { cleanBookingZone } from "./book";

// The zone sent with a booking is written onto a real person's CRM record, and
// every reminder GoHighLevel sends them is rendered against it. A junk value
// does not error anywhere: GHL takes it and silently falls back to the
// location's zone, which is America/New_York, which is the bug this exists to
// stop. So it is checked rather than trusted.
describe("cleanBookingZone", () => {
  it("takes a real IANA zone", () => {
    expect(cleanBookingZone("America/Los_Angeles")).toBe("America/Los_Angeles");
    expect(cleanBookingZone("America/Chicago")).toBe("America/Chicago");
    expect(cleanBookingZone("  America/New_York  ")).toBe("America/New_York");
  });

  it("refuses a zone that is not one", () => {
    expect(cleanBookingZone("Pacific")).toBeNull();
    expect(cleanBookingZone("Middle/Earth")).toBeNull();
  });

  // The trap. Intl ACCEPTS these, so the obvious validation waves them through,
  // and in the IANA database "PST" is a fixed UTC-8 that never moves for
  // daylight saving. A contact filed under it is told an hour that is sixty
  // minutes out from March to November: a fix that reads as a fix and reproduces
  // the bug.
  it("refuses the old abbreviations, which have no daylight saving", () => {
    expect(cleanBookingZone("PST")).toBeNull();
    expect(cleanBookingZone("EST")).toBeNull();
    expect(cleanBookingZone("UTC")).toBeNull();
  });

  // Null rather than a default. Asserting a wrong zone is worse than asserting
  // none: with none, GoHighLevel keeps whatever the contact already had.
  it("is null for nothing at all", () => {
    expect(cleanBookingZone("")).toBeNull();
    expect(cleanBookingZone("   ")).toBeNull();
    expect(cleanBookingZone(null)).toBeNull();
    expect(cleanBookingZone(undefined)).toBeNull();
    expect(cleanBookingZone(42)).toBeNull();
  });
});
