import { describe, it, expect } from "vitest";
import {
  areaCodeOf,
  hourInZone,
  isOutsideCallingHours,
  localTimeLabel,
  timeInZone,
  zoneForLead,
} from "./leadLocalTime";

// A fixed instant: 26 July 2026, 19:30 UTC. Summer, so the US is on DST.
// That is 3:30pm in New York, 12:30pm in Los Angeles, 12:30pm in Phoenix
// (no DST), 9:30am in Honolulu.
const NOON_ISH = Date.UTC(2026, 6, 26, 19, 30);

describe("areaCodeOf", () => {
  it("reads a formatted number", () => {
    expect(areaCodeOf("(313) 555-0142")).toBe("313");
  });

  it("reads a number with a country code", () => {
    expect(areaCodeOf("+1 415 555 0142")).toBe("415");
  });

  it("returns nothing for a number too short to read", () => {
    expect(areaCodeOf("555-0142")).toBe("");
  });

  it("returns nothing when the first three digits cannot be an area code", () => {
    expect(areaCodeOf("1112223333")).toBe("");
  });

  it("survives an empty field", () => {
    expect(areaCodeOf("")).toBe("");
  });
});

describe("zoneForLead", () => {
  it("takes the lead's own timezone when it is a real IANA name", () => {
    expect(zoneForLead({ timezone: "America/Denver", phone: "(313) 555-0142" })).toEqual({
      zone: "America/Denver",
      source: "lead",
    });
  });

  it("understands the shorthand people actually type", () => {
    expect(zoneForLead({ timezone: "PST" })?.zone).toBe("America/Los_Angeles");
    expect(zoneForLead({ timezone: " central " })?.zone).toBe("America/Chicago");
  });

  it("falls back to the area code, and says that is where it came from", () => {
    expect(zoneForLead({ phone: "313-555-0142" })).toEqual({
      zone: "America/New_York",
      source: "areaCode",
    });
    expect(zoneForLead({ phone: "(602) 555-0142" })?.zone).toBe("America/Phoenix");
    expect(zoneForLead({ phone: "808 555 0142" })?.zone).toBe("Pacific/Honolulu");
  });

  it("ignores a timezone field that means nothing", () => {
    expect(zoneForLead({ timezone: "whenever", phone: "415-555-0142" })).toEqual({
      zone: "America/Los_Angeles",
      source: "areaCode",
    });
  });

  it("returns null rather than defaulting to Eastern", () => {
    expect(zoneForLead({})).toBeNull();
    expect(zoneForLead({ timezone: "", phone: "555" })).toBeNull();
  });
});

describe("the clock", () => {
  it("tells the time where they are", () => {
    expect(timeInZone("America/New_York", NOON_ISH)).toBe("3:30 PM");
    expect(timeInZone("America/Los_Angeles", NOON_ISH)).toBe("12:30 PM");
  });

  it("keeps Arizona off daylight saving", () => {
    expect(timeInZone("America/Phoenix", NOON_ISH)).toBe("12:30 PM");
  });

  it("gives the hour as a number", () => {
    expect(hourInZone("America/New_York", NOON_ISH)).toBe(15);
    expect(hourInZone("Pacific/Honolulu", NOON_ISH)).toBe(9);
  });

  it("labels the time for the call card", () => {
    expect(localTimeLabel("America/Chicago", NOON_ISH)).toBe("2:30 PM their time");
  });
});

describe("isOutsideCallingHours", () => {
  it("is fine in the middle of the afternoon", () => {
    expect(isOutsideCallingHours("America/New_York", NOON_ISH)).toBe(false);
  });

  it("catches too early", () => {
    // 12:30 UTC is 7:30am in New York.
    const early = Date.UTC(2026, 6, 26, 11, 30);
    expect(isOutsideCallingHours("America/New_York", early)).toBe(true);
  });

  it("catches too late", () => {
    // 02:30 UTC is 9:30pm the previous evening in New York.
    const late = Date.UTC(2026, 6, 27, 1, 30);
    expect(isOutsideCallingHours("America/New_York", late)).toBe(true);
  });

  it("treats 9pm itself as too late and 8am as fine", () => {
    expect(isOutsideCallingHours("America/New_York", Date.UTC(2026, 6, 27, 1, 0))).toBe(true);
    expect(isOutsideCallingHours("America/New_York", Date.UTC(2026, 6, 26, 12, 0))).toBe(false);
  });

  it("is judged where THEY are, not where the caller is", () => {
    // 11:30 UTC: 7:30am in New York (too early), 4:30am in LA (far too early),
    // but the same instant is a perfectly good 5:30am nowhere. Check the zone
    // actually drives the answer.
    const early = Date.UTC(2026, 6, 26, 11, 30);
    expect(isOutsideCallingHours("America/New_York", early)).toBe(true);
    expect(isOutsideCallingHours("Europe/London", early)).toBe(false);
  });
});
