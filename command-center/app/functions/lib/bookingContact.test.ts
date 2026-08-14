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
  // A booking needs an email, so the baseline prospect has one and the tests
  // below are about everything EXCEPT that rule. The rule itself is tested on
  // its own, further down.
  email: "office@reidroofing.com",
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

  it("treats an empty phone or email as leave it alone, never as clear it", () => {
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

  it("lets a typed phone stand in for one the book never had", () => {
    const noPhone = { first_name: "", last_name: "", phone: "", email: "office@reidroofing.com" };
    const r = resolveBookingContact(noPhone, { phone: "248-555-0171" });
    expect(r.error).toBeNull();
    expect(r.contact.phone).toBe("+12485550171");
    expect(r.changed).toEqual({ phone: "+12485550171" });
  });

  it("collapses whitespace in a name without rejecting it", () => {
    const r = resolveBookingContact(stored, { firstName: "  Mary   Anne  " });
    expect(r.contact.firstName).toBe("Mary Anne");
  });
});

// The whole reason the panel asks. A scraped prospect arrives with the COMPANY
// sitting in the two name columns, so booking one has to be able to put a person
// there instead, and the company has to survive somewhere.
describe("resolveBookingContact, a business in the name columns", () => {
  const scraped = {
    first_name: "BM Heating",
    last_name: "& Cooling",
    business_name: "",
    phone: "+12485550171",
    email: "office@bmheating.com",
  };

  it("lets the surname be cleared, because the company is not a surname", () => {
    const r = resolveBookingContact(scraped, { firstName: "Mohamad", lastName: "" });
    expect(r.error).toBeNull();
    expect(r.contact.firstName).toBe("Mohamad");
    expect(r.contact.lastName).toBe("");
    expect(r.changed).toEqual({ firstName: "Mohamad", lastName: "" });
  });

  it("leaves a name alone when the field was not sent at all", () => {
    // undefined, not "". An older client that never had the box must not have
    // its silence read as an erase.
    const r = resolveBookingContact(scraped, { firstName: "Mohamad" });
    expect(r.contact.lastName).toBe("& Cooling");
    expect(r.changed).toEqual({ firstName: "Mohamad" });
  });

  it("keeps the company, typed alongside the person", () => {
    const r = resolveBookingContact(scraped, {
      firstName: "Mohamad",
      lastName: "",
      businessName: "BM Heating & Cooling",
    });
    expect(r.contact.businessName).toBe("BM Heating & Cooling");
    expect(r.changed.businessName).toBe("BM Heating & Cooling");
  });

  it("does not blank a company name corrected in GoHighLevel by hand", () => {
    const known = { ...scraped, business_name: "BM Heating & Cooling LLC" };
    const r = resolveBookingContact(known, { firstName: "Mohamad", businessName: "" });
    expect(r.contact.businessName).toBe("BM Heating & Cooling LLC");
    expect(r.changed.businessName).toBeUndefined();
  });

  it("hands back the stored company on a refusal, not an empty one", () => {
    const known = { ...scraped, business_name: "BM Heating & Cooling LLC", email: "" };
    const r = resolveBookingContact(known, { firstName: "Mohamad" });
    expect(r.error).not.toBeNull();
    expect(r.contact.businessName).toBe("BM Heating & Cooling LLC");
  });
});

// A meeting needs an email address. The rule this replaced was "a phone number
// OR an email", which every scraped prospect satisfied with the switchboard
// number it arrived with, so it never once stopped a booking.
describe("resolveBookingContact, the email rule", () => {
  const noEmail = {
    first_name: "Dana",
    last_name: "",
    business_name: "Reid Roofing",
    phone: "+12485550171",
    email: "",
  };

  it("refuses a booking for a prospect with no email", () => {
    const r = resolveBookingContact(noEmail, {});
    expect(r.error).toMatch(/email/i);
    expect(r.changed).toEqual({});
  });

  it("is not satisfied by a phone number, which is the whole change", () => {
    const r = resolveBookingContact(noEmail, { phone: "248-555-0171" });
    expect(r.error).toMatch(/email/i);
  });

  it("lets one typed on the call satisfy it", () => {
    const r = resolveBookingContact(noEmail, { email: "dana@reidroofing.com" });
    expect(r.error).toBeNull();
    expect(r.contact.email).toBe("dana@reidroofing.com");
    expect(r.changed.email).toBe("dana@reidroofing.com");
  });

  it("refuses a half-typed one rather than reporting it missing", () => {
    // Two different mistakes deserve two different sentences: "you have not
    // typed one" and "what you typed is not an address".
    expect(resolveBookingContact(noEmail, { email: "dana@" }).error).toMatch(
      /does not look right/i,
    );
  });

  it("still books when the book already holds one and nobody retypes it", () => {
    const r = resolveBookingContact({ ...noEmail, email: "office@reidroofing.com" }, {});
    expect(r.error).toBeNull();
    expect(r.contact.email).toBe("office@reidroofing.com");
    expect(r.changed).toEqual({});
  });
});
