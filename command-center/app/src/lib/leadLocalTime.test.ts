import { describe, it, expect } from "vitest";
import {
  ZONE_CHOICES,
  areaCodeOf,
  hourInZone,
  isOutsideCallingHours,
  localTimeLabel,
  pickedZone,
  timeInZone,
  zoneForLead,
  zoneLabel,
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

// The picker exists to correct the area-code inference, so what it can guess and
// what it can offer have to be the same set.
describe("ZONE_CHOICES", () => {
  it("offers every zone an area code can produce", () => {
    const offered = new Set(ZONE_CHOICES.map((c) => c.zone));
    const guessable = new Set<string>();
    // Sweep every possible area code and collect whatever the map returns.
    for (let n = 200; n <= 999; n += 1) {
      const found = zoneForLead({ phone: `${n}5550100` });
      if (found) guessable.add(found.zone);
    }
    expect(guessable.size).toBeGreaterThan(5);
    for (const zone of guessable) expect(offered.has(zone)).toBe(true);
  });

  it("offers only zones this runtime actually knows", () => {
    for (const { zone } of ZONE_CHOICES) {
      expect(() => new Intl.DateTimeFormat("en-US", { timeZone: zone })).not.toThrow();
    }
  });

  it("has no two choices reading the same", () => {
    const labels = ZONE_CHOICES.map((c) => c.label);
    expect(new Set(labels).size).toBe(labels.length);
    const zones = ZONE_CHOICES.map((c) => c.zone);
    expect(new Set(zones).size).toBe(zones.length);
  });

  it("keeps Arizona apart from Mountain, which is the point of listing it", () => {
    // Summer: Denver is on DST and Phoenix is not, so they are an hour apart.
    expect(timeInZone("America/Denver", NOON_ISH)).not.toBe(
      timeInZone("America/Phoenix", NOON_ISH),
    );
  });
});

describe("zoneLabel", () => {
  it("names a zone the way the picker does", () => {
    expect(zoneLabel("America/Denver")).toBe("Mountain");
  });

  it("hands back anything it does not offer rather than inventing a name", () => {
    expect(zoneLabel("Europe/London")).toBe("Europe/London");
  });
});

describe("pickedZone", () => {
  it("is empty when the clock is only inferred, so the picker reads as auto", () => {
    expect(pickedZone({ phone: "313-555-0142" })).toBe("");
  });

  it("is empty when nothing is known at all", () => {
    expect(pickedZone({})).toBe("");
  });

  it("shows what was written down", () => {
    expect(pickedZone({ timezone: "America/Denver", phone: "313-555-0142" })).toBe(
      "America/Denver",
    );
  });

  it("resolves the shorthand somebody typed, rather than showing auto", () => {
    // A row that says "EST" HAS a timezone. Reading it as unset would quietly
    // overwrite it with the area code the first time anything else was saved.
    expect(pickedZone({ timezone: "EST", phone: "602-555-0142" })).toBe("America/New_York");
  });

  it("beats the area code, which is what an override is for", () => {
    // A 313 number says Eastern. The caller learned they are in Denver.
    const lead = { timezone: "America/Denver", phone: "313-555-0142" };
    expect(zoneForLead(lead)?.source).toBe("lead");
    expect(pickedZone(lead)).toBe("America/Denver");
  });
});
