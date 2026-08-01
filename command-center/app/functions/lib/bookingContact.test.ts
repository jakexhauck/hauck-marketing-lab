import { describe, expect, it } from "vitest";
import {
  cleanEmail,
  cleanPhone,
  resolveBookingContact,
} from "./bookingContact";

const stored = {
  first_name: "",
  last_name: "",
  phone: "+12485550171",
  email: "",
};

describe("cleanPhone", () => {
  it("accepts what a person actually types mid-call", () => {
    for (const typed of [
      "(248) 555-0171",
      "248.555.0171",
      "248 555 0171",
      "2485550171",
      "+1 248 555 0171",
      "1-248-555-0171",
    ]) {
      expect(cleanPhone(typed)).toBe("+12485550171");
    }
  });

  it("refuses a number too short to dial", () => {
    expect(cleanPhone("5550171")).toBe("");
    expect(cleanPhone("248")).toBe("");
    expect(cleanPhone("")).toBe("");
  });

  it("keeps a genuine international number as given", () => {
    expect(cleanPhone("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("refuses something long enough to be a mistake", () => {
    expect(cleanPhone("+1234567890123456789")).toBe("");
  });
});

describe("cleanEmail", () => {
  it("takes a real address and lowercases it", () => {
    expect(cleanEmail("  Dana@ReidRoofing.com ")).toBe("dana@reidroofing.com");
  });

  it("refuses a half-typed one", () => {
    expect(cleanEmail("dana@")).toBe("");
    expect(cleanEmail("dana")).toBe("");
    expect(cleanEmail("dana@reidroofing")).toBe("");
    expect(cleanEmail("a b@c.com")).toBe("");
  });
});

describe("resolveBookingContact", () => {
  it("fills in the person learned on the call", () => {
    const r = resolveBookingContact(stored, {
      firstName: "Dana",
      email: "dana@reidroofing.com",
    });
    expect(r.error).toBeNull();
    expect(r.contact.firstName).toBe("Dana");
    expect(r.contact.email).toBe("dana@reidroofing.com");
    // Untouched, so it keeps the number the scraper found.
    expect(r.contact.phone).toBe("+12485550171");
  });

  it("reports only what actually changed", () => {
    const r = resolveBookingContact(stored, {
      firstName: "Dana",
      phone: "(248) 555-0171",
    });
    // The phone was retyped but normalises to what is already stored, so it is
    // not a change and must not be written back.
    expect(r.changed).toEqual({ firstName: "Dana" });
  });

  it("treats an empty field as leave it alone, never as clear it", () => {
    // Mid-call, an accidental select-all-delete must not wipe the only number
    // a prospect has.
    const r = resolveBookingContact(stored, { phone: "", email: "" });
    expect(r.error).toBeNull();
    expect(r.contact.phone).toBe("+12485550171");
    expect(r.changed).toEqual({});
  });

  it("refuses a typo rather than quietly booking the old number", () => {
    // The dangerous case: falling back to the stored value here would look
    // exactly like success while the meeting goes to the wrong number.
    const r = resolveBookingContact(stored, { phone: "2485" });
    expect(r.error).toMatch(/phone number/i);
    expect(r.changed).toEqual({});
  });

  it("refuses a half-typed email", () => {
    expect(resolveBookingContact(stored, { email: "dana@" }).error).toMatch(/email/i);
  });

  it("lets a typed phone satisfy a prospect that had neither", () => {
    const bare = { first_name: "", last_name: "", phone: "", email: "" };
    expect(resolveBookingContact(bare, {}).error).toMatch(/phone number or an email/i);

    const r = resolveBookingContact(bare, { phone: "248-555-0171" });
    expect(r.error).toBeNull();
    expect(r.contact.phone).toBe("+12485550171");
    expect(r.changed).toEqual({ phone: "+12485550171" });
  });

  it("collapses whitespace in a name without rejecting it", () => {
    const r = resolveBookingContact(stored, { firstName: "  Mary   Anne  " });
    expect(r.contact.firstName).toBe("Mary Anne");
  });
});
