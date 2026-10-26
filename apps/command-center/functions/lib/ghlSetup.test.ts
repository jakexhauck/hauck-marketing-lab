import { describe, expect, it } from "vitest";
import {
  buildCalendarUpdate,
  buildFieldBody,
  buildProfileUpdate,
  buildUserCreate,
  formFacts,
  ghlErrorText,
  newPassword,
  parseCalendarPatch,
  parseFieldInput,
  parseHoursText,
  parseProfileInput,
  parseStaffInput,
  shapeAvailable,
  shapeCalendar,
  shapeNumbers,
  shapeProfile,
  shapeSetupPipelines,
  shapeUsers,
  toE164,
  withLocation,
  withoutLocation,
  SALES_STAGES,
} from "./ghlSetup";

describe("parseHoursText", () => {
  it("reads the ways owners type their hours", () => {
    expect(parseHoursText("8am - 6pm")).toEqual(["08:00", "18:00"]);
    expect(parseHoursText("9am-5pm")).toEqual(["09:00", "17:00"]);
    expect(parseHoursText("7:30 AM to 4:30 PM")).toEqual(["07:30", "16:30"]);
    expect(parseHoursText("9 - 5")).toEqual(["09:00", "17:00"]);
    expect(parseHoursText("12pm - 8pm")).toEqual(["12:00", "20:00"]);
  });

  it("treats blank, closed, off and nonsense as closed", () => {
    for (const s of ["", "Closed", "Off", "by appointment", "6pm - 8am", undefined]) expect(parseHoursText(s)).toBeNull();
  });
});

describe("formFacts", () => {
  // Comfort Wizards' real answers, 2026-10-26.
  const intake = {
    name: "Comfort Wizards LLC",
    contactName: "Tyler X Jackson",
    contactEmail: "tyler@example.com",
    contactPhone: "8152784229",
    timezone: "America/Chicago",
    websiteUrl: "https://www.comfortwizardsllc.com",
    addressStreet: "12 Main St",
    addressUnit: "Suite 2",
    addressCity: "Joliet",
    addressState: "IL",
    addressZip: "60431",
    hoursMonday: "8am - 6pm",
    hoursSaturday: "8am - 6pm",
    hoursSunday: "Closed",
  };

  it("splits the owner's name and puts the phone in GHL's format", () => {
    const f = formFacts(intake);
    expect([f.ownerFirst, f.ownerLast, f.ownerFull]).toEqual(["Tyler", "X Jackson", "Tyler X Jackson"]);
    expect(f.phone).toBe("+18152784229");
    expect(f.street).toBe("12 Main St, Suite 2");
    expect(f.timezone).toBe("America/Chicago");
  });

  it("gives Sunday-first hours, a blank day closed", () => {
    const f = formFacts(intake);
    expect(f.hours).toEqual([null, ["08:00", "18:00"], null, null, null, null, ["08:00", "18:00"]]);
    expect(formFacts({ name: "x" }).hours).toBeNull();
  });

  it("drops a website that is really an email (Clear Choice typed one)", () => {
    expect(formFacts({ websiteUrl: "clearchoiceowensboro@gmail.com" }).website).toBe("");
    expect(formFacts({ websiteUrl: "Aboveallgarages.com" }).website).toBe("https://Aboveallgarages.com");
  });
});

describe("toE164", () => {
  it("only answers for a US number", () => {
    expect(toE164("(734) 555-0142")).toBe("+17345550142");
    expect(toE164("1 734 555 0142")).toBe("+17345550142");
    expect(toE164("555-0142")).toBe("");
  });
});

describe("business profile", () => {
  it("reads GHL's location record", () => {
    const p = shapeProfile({ location: { name: "CW", address: "15744 BELMONT AVE", city: "ALLEN PARK", companyId: "co1", timezone: "America/Detroit" } });
    expect(p).toMatchObject({ name: "CW", address: "15744 BELMONT AVE", city: "ALLEN PARK", companyId: "co1", country: "US" });
  });

  it("always sends companyId and never blanks a field GHL already has", () => {
    const input = parseProfileInput({ name: "CW", phone: "815 278 4229", website: "", address: "12 Main", city: "Joliet", state: "IL", postalCode: "60431", country: "US", timezone: "America/Chicago" })!;
    expect(input.phone).toBe("+18152784229");
    const body = buildProfileUpdate(input, "co1");
    expect(body).toMatchObject({ companyId: "co1", name: "CW", timezone: "America/Chicago" });
    expect("website" in body).toBe(false);
  });

  it("refuses a missing name or a bad phone", () => {
    expect(parseProfileInput({ name: "" })).toBeNull();
    expect(parseProfileInput({ name: "x", phone: "123" })).toBeNull();
  });
});

describe("staff", () => {
  const raw = {
    users: [
      { id: "jake", firstName: "jake", lastName: "hauck", email: "realjakehauck@gmail.com", roles: { type: "account", role: "admin", locationIds: ["a", "b"] } },
      { id: "gone", deleted: true, roles: {} },
    ],
  };

  it("skips deleted users", () => {
    expect(shapeUsers(raw).map((u) => u.id)).toEqual(["jake"]);
  });

  it("adds and removes one sub-account without touching the others", () => {
    const [jake] = shapeUsers(raw);
    expect(withLocation(jake, "c")).toEqual(["a", "b", "c"]);
    expect(withLocation(jake, "a")).toEqual(["a", "b"]);
    expect(withoutLocation(jake, "a")).toEqual(["b"]);
    expect(withoutLocation({ ...jake, locationIds: ["a"] }, "a")).toBeNull();
  });

  it("creates an account user on this sub-account only", () => {
    const input = parseStaffInput({ firstName: "Tyler", lastName: "Jackson", email: "T@x.com", phone: "8152784229", role: "admin" })!;
    const body = buildUserCreate(input, "co1", "loc1", "pw");
    expect(body).toMatchObject({ companyId: "co1", email: "t@x.com", phone: "+18152784229", type: "account", role: "admin", locationIds: ["loc1"] });
    expect(parseStaffInput({ firstName: "x", email: "nope" })).toBeNull();
    expect(parseStaffInput({ firstName: "x", email: "a@b.co", phone: "12" })).toBeNull();
  });

  it("makes passwords GHL accepts", () => {
    for (let i = 0; i < 20; i++) {
      const p = newPassword();
      expect(p).toHaveLength(16);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/\d/);
      expect(p).toMatch(/[!@#$%*?]/);
    }
  });
});

describe("custom fields", () => {
  it("creates only the types GHL's create body supports, as contact fields", () => {
    expect(parseFieldInput({ name: "How many windows?", dataType: "RADIO" }, true)).toBeNull();
    const input = parseFieldInput({ name: "How many windows?", dataType: "NUMERICAL" }, true)!;
    expect(buildFieldBody(input, true)).toEqual({ name: "How many windows?", dataType: "NUMERICAL", model: "contact" });
  });

  it("renames without resending the type", () => {
    const input = parseFieldInput({ name: "Homeowner?", dataType: "RADIO" }, false)!;
    expect(buildFieldBody(input, false)).toEqual({ name: "Homeowner?" });
  });
});

describe("calendars", () => {
  // Comfort Wizards' Home Estimate as GHL returned it, 2026-10-26 (trimmed).
  const homeEstimate = {
    id: "cal1",
    name: "Home Estimate",
    isActive: true,
    calendarType: "event",
    teamMembers: [],
    slotDuration: 45,
    slotDurationUnit: "mins",
    slotInterval: 1,
    slotIntervalUnit: "hours",
    slotBuffer: 30,
    slotBufferUnit: "mins",
    appoinmentPerSlot: 1,
    appoinmentPerDay: "",
    allowBookingAfter: 24,
    allowBookingAfterUnit: "hours",
    allowBookingFor: 7,
    allowBookingForUnit: "days",
    autoConfirm: true,
    formSubmitRedirectUrl: "",
    openHours: [
      { daysOfTheWeek: [1], hours: [{ openHour: 8, openMinute: 0, closeHour: 18, closeMinute: 0 }] },
      { daysOfTheWeek: [6], hours: [{ openHour: 8, openMinute: 30, closeHour: 12, closeMinute: 0 }] },
    ],
  };

  it("reads hours Sunday first and the booking rules in hours and days", () => {
    const c = shapeCalendar(homeEstimate);
    expect(c.hours).toEqual([null, [["08:00", "18:00"]], null, null, null, null, [["08:30", "12:00"]]]);
    expect(c).toMatchObject({ team: [], slotDuration: 45, slotBuffer: 30, noticeHours: 24, rangeDays: 7, perDay: null, autoConfirm: true });
  });

  it("keeps the calendar's own slot settings on every write", () => {
    const body = buildCalendarUpdate(homeEstimate, { autoConfirm: false });
    // The 1 hour interval goes as 60 minutes: GHL reads it as minutes (ghlCalendarWrite.ts).
    expect(body).toMatchObject({ slotDuration: 45, slotInterval: 60, slotIntervalUnit: "mins", slotBuffer: 30, allowBookingAfter: 24, autoConfirm: false });
    expect(body.openHours).toEqual(homeEstimate.openHours);
    // GHL rejects these when echoed back (ghlCalendarWrite.ts).
    expect("formSubmitRedirectUrl" in body).toBe(false);
    expect("teamMembers" in body).toBe(false);
  });

  it("writes hours and team members in GHL's shape", () => {
    const body = buildCalendarUpdate(homeEstimate, { team: ["owner"], hours: [null, [["07:00", "18:00"]], null, null, null, null, null] });
    expect(body.teamMembers).toEqual([{ userId: "owner", priority: 1, isPrimary: true }]);
    expect(body.openHours).toEqual([{ daysOfTheWeek: [1], hours: [{ openHour: 7, openMinute: 0, closeHour: 18, closeMinute: 0 }] }]);
  });

  it("keeps an existing member's own settings when the team changes", () => {
    const withMember = { ...homeEstimate, teamMembers: [{ userId: "jake", priority: 0.5, meetingLocationType: "address" }] };
    const body = buildCalendarUpdate(withMember, { team: ["jake", "owner"] });
    expect(body.teamMembers).toEqual([{ userId: "jake", priority: 0.5, meetingLocationType: "address" }, { userId: "owner", priority: 1, isPrimary: false }]);
  });

  it("refuses an empty team and backwards hours", () => {
    expect(parseCalendarPatch({ team: [] })).toBe("A calendar needs at least one team member.");
    expect(typeof parseCalendarPatch({ hours: [null, [["18:00", "08:00"]], null, null, null, null, null] })).toBe("string");
    expect(parseCalendarPatch({ autoConfirm: true, noticeHours: 4 })).toEqual({ autoConfirm: true, noticeHours: 4 });
  });
});

describe("pipelines", () => {
  it("keeps Sales Pipeline and checks its stages", () => {
    const p = shapeSetupPipelines({
      pipelines: [
        { id: "s", name: "Sales Pipeline", stages: SALES_STAGES.map((name, position) => ({ name, position })).reverse() },
        { id: "m", name: "Marketing Pipeline", stages: [{ name: "New", position: 0 }] },
      ],
    });
    expect(p.map((x) => [x.name, x.keep, x.stagesMatch])).toEqual([["Sales Pipeline", true, true], ["Marketing Pipeline", false, false]]);
  });
});

describe("phone numbers", () => {
  it("reads the numbers and the default", () => {
    const n = shapeNumbers({ numbers: [{ phoneNumber: "+18156621535", friendlyName: "Local Number", type: "local", isDefaultNumber: true, forwardingNumber: "", capabilities: { sms: true, voice: true, mms: true } }] });
    expect(n).toEqual([{ number: "+18156621535", name: "Local Number", type: "local", isDefault: true, forwarding: "", sms: true, voice: true, mms: true }]);
  });

  it("keeps only US numbers on offer", () => {
    const a = shapeAvailable({ fingerprintId: "fp", numbers: [{ phoneNumber: "+18705871861", friendlyName: "(870) 587-1861", locality: "Wynne", region: "AR", price: { price: 1.15 } }, { phoneNumber: "+44123" }] });
    expect(a).toEqual({ fingerprintId: "fp", numbers: [{ number: "+18705871861", label: "(870) 587-1861", locality: "Wynne", region: "AR", price: 1.15 }] });
  });
});

describe("ghlErrorText", () => {
  it("turns a missing scope into the reinstall step", () => {
    expect(ghlErrorText('GHL GET /medias/files returned 401: {"message":"The token is not authorized for this scope."}')).toMatch(/reinstalling/);
    expect(ghlErrorText("GHL PUT /x returned 422: bad")).toBe("GHL said no: GHL PUT /x returned 422: bad");
  });
});
