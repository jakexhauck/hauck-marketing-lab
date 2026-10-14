import { describe, expect, it } from "vitest";
import { e164, formatPhone, formatPhoneDashed } from "./phone";

describe("formatPhoneDashed", () => {
  it("strips the country code and groups the ten digits", () => {
    expect(formatPhoneDashed("+12485550171")).toBe("248-555-0171");
  });

  it("takes a number in whatever shape it is already stored or typed", () => {
    for (const input of [
      "2485550171",
      "12485550171",
      "(248) 555-0171",
      "248.555.0171",
      "+1 248 555 0171",
      "  248-555-0171  ",
    ]) {
      expect(formatPhoneDashed(input)).toBe("248-555-0171");
    }
  });

  it("leaves a non-NANP number alone rather than mangling it", () => {
    // The trap formatPhone falls into: slicing the last ten digits off a London
    // number renders it as a US one, which is not a phone number anywhere.
    expect(formatPhoneDashed("+442079460958")).toBe("+442079460958");
    expect(formatPhone("+442079460958")).toBe("(207) 946-0958");
  });

  it("hands back anything too short to be a number", () => {
    expect(formatPhoneDashed("2485")).toBe("2485");
    expect(formatPhoneDashed("")).toBe("");
    expect(formatPhoneDashed(null)).toBe("");
    expect(formatPhoneDashed(undefined)).toBe("");
  });

  it("never changes what would be stored", () => {
    // Display only. Round-tripping the formatted value back through e164 must
    // give the same thing that was stored, or formatting a number in a prefilled
    // input would quietly rewrite the column on the next save.
    const stored = "+12485550171";
    expect(e164(formatPhoneDashed(stored))).toBe(stored);
  });
});
