import { describe, expect, it } from "vitest";
import {
  buildImportRows,
  parseCsv,
  splitFullName,
  suggestMapping,
  type LeadField,
} from "./csvLeads";

describe("parseCsv", () => {
  it("reads headers and rows", () => {
    const out = parseCsv("First,Last,Phone\nJane,Miller,5550001111");
    expect(out.headers).toEqual(["First", "Last", "Phone"]);
    expect(out.rows).toEqual([["Jane", "Miller", "5550001111"]]);
  });

  it("keeps commas inside quoted cells", () => {
    const out = parseCsv('Name,Notes\n"Miller, Jane","Called twice, no answer"');
    expect(out.rows[0]).toEqual(["Miller, Jane", "Called twice, no answer"]);
  });

  it("handles escaped quotes", () => {
    const out = parseCsv('Name,Notes\nJane,"She said ""call back Friday"""');
    expect(out.rows[0][1]).toBe('She said "call back Friday"');
  });

  it("survives Windows line endings and an Excel BOM", () => {
    const out = parseCsv('﻿First,Phone\r\nJane,5550001111\r\n');
    expect(out.headers).toEqual(["First", "Phone"]);
    expect(out.rows).toEqual([["Jane", "5550001111"]]);
  });

  it("pads short rows so a column index is always safe", () => {
    const out = parseCsv("First,Last,Phone\nJane");
    expect(out.rows[0]).toEqual(["Jane", "", ""]);
  });

  it("drops blank lines rather than importing empty prospects", () => {
    const out = parseCsv("First,Phone\nJane,5550001111\n\n   \n");
    expect(out.rows).toHaveLength(1);
  });

  it("returns nothing for an empty file", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
    expect(parseCsv("   \n  ")).toEqual({ headers: [], rows: [] });
  });
});

describe("suggestMapping", () => {
  it("places the obvious headers", () => {
    const m = suggestMapping(["First Name", "Last Name", "Phone Number", "Email"]);
    expect(m).toEqual({ 0: "firstName", 1: "lastName", 2: "phone", 3: "email" });
  });

  it("recognises the spellings real exports use", () => {
    const m = suggestMapping(["fname", "surname", "Mobile", "e-mail address"]);
    expect(m[0]).toBe("firstName");
    expect(m[1]).toBe("lastName");
    expect(m[2]).toBe("phone");
    expect(m[3]).toBe("email");
  });

  it("maps a lone Name column to the splittable full name", () => {
    const m = suggestMapping(["Name", "Phone"]);
    expect(m[0]).toBe("fullName");
  });

  it("drops the full-name guess when a first name column exists", () => {
    const m = suggestMapping(["Name", "First Name", "Phone"]);
    expect(Object.values(m)).not.toContain("fullName");
    expect(Object.values(m)).toContain("firstName");
  });

  it("never maps two columns to the same field", () => {
    const m = suggestMapping(["Phone", "Phone 2", "Mobile"]);
    const fields = Object.values(m);
    expect(new Set(fields).size).toBe(fields.length);
  });

  it("leaves a column it cannot place unmapped rather than guessing", () => {
    const m = suggestMapping(["Widget Score", "Phone"]);
    expect(m[0]).toBeUndefined();
    expect(m[1]).toBe("phone");
  });

  // This used to send a company column into notes, and industry into source,
  // because the book had nowhere else to put them (0059 gave it somewhere).
  it("sends a company column to the business name, not to notes", () => {
    const m = suggestMapping(["Company", "Phone"]);
    expect(m[0]).toBe("businessName");
  });

  it("sends an industry column to the niche, not to source", () => {
    const m = suggestMapping(["Industry", "Phone"]);
    expect(m[0]).toBe("niche");
  });

  it("keeps source meaning which list, when both are present", () => {
    const m = suggestMapping(["Niche", "List Name", "Phone"]);
    expect(m[0]).toBe("niche");
    expect(m[1]).toBe("source");
  });

  it("places the rest of a business row", () => {
    const m = suggestMapping(["Business Name", "Website", "City", "State", "Phone"]);
    expect(m[0]).toBe("businessName");
    expect(m[1]).toBe("website");
    expect(m[2]).toBe("city");
    expect(m[3]).toBe("state");
    expect(m[4]).toBe("phone");
  });

  // The contains pass is greedy, so the field order it considers matters. A
  // dialing list cannot work without the phone number, so phone is asked first.
  it("gives 'Business Phone' to phone rather than to the business name", () => {
    const m = suggestMapping(["Business Phone", "Company"]);
    expect(m[0]).toBe("phone");
    expect(m[1]).toBe("businessName");
  });

  // "st" was a state hint until it started matching "first", "last" and
  // "status".
  it("does not read a name or status column as a state", () => {
    const m = suggestMapping(["First Name", "Last Name", "Status", "Phone"]);
    expect(m[0]).toBe("firstName");
    expect(m[1]).toBe("lastName");
    expect(m[2]).toBeUndefined();
    expect(m[3]).toBe("phone");
  });
});

describe("splitFullName", () => {
  it("splits on the first space and keeps the rest as the surname", () => {
    expect(splitFullName("Jane Miller")).toEqual({ firstName: "Jane", lastName: "Miller" });
    expect(splitFullName("Maria del Carmen Ruiz")).toEqual({
      firstName: "Maria",
      lastName: "del Carmen Ruiz",
    });
  });

  it("handles one name and empty input", () => {
    expect(splitFullName("Cher")).toEqual({ firstName: "Cher", lastName: "" });
    expect(splitFullName("   ")).toEqual({ firstName: "", lastName: "" });
  });
});

describe("buildImportRows", () => {
  const mapping: Record<number, LeadField> = { 0: "firstName", 1: "lastName", 2: "phone" };

  it("builds the payload the endpoint takes", () => {
    const parsed = parseCsv("First,Last,Phone\nJane,Miller,555-000-1111");
    const { rows, skippedNoPhone } = buildImportRows(parsed, mapping);
    expect(skippedNoPhone).toBe(0);
    expect(rows).toEqual([
      {
        firstName: "Jane",
        lastName: "Miller",
        phone: "555-000-1111",
        email: "",
        timezone: "",
        source: "",
        notes: "",
        // Every field the endpoint accepts is present and blank, so a partial
        // file never sends undefined at a not-null column.
        businessName: "",
        niche: "",
        website: "",
        city: "",
        state: "",
      },
    ]);
  });

  it("drops rows with no phone and counts them, before anything is sent", () => {
    // A row nobody can call is not a lead, it is a hole in the queue.
    const parsed = parseCsv("First,Last,Phone\nJane,Miller,5550001111\nBob,Stone,\nAmy,Fox,   ");
    const { rows, skippedNoPhone } = buildImportRows(parsed, mapping);
    expect(rows).toHaveLength(1);
    expect(skippedNoPhone).toBe(2);
  });

  it("splits a full name column", () => {
    const parsed = parseCsv("Name,Phone\nJane Miller,5550001111");
    const { rows } = buildImportRows(parsed, { 0: "fullName", 1: "phone" });
    expect(rows[0].firstName).toBe("Jane");
    expect(rows[0].lastName).toBe("Miller");
  });

  it("lets an explicit first name column win over the split, in either order", () => {
    const parsed = parseCsv("Name,Given,Phone\nJane Miller,Janet,5550001111");
    expect(
      buildImportRows(parsed, { 0: "fullName", 1: "firstName", 2: "phone" }).rows[0].firstName,
    ).toBe("Janet");
    const reversed = parseCsv("Given,Name,Phone\nJanet,Jane Miller,5550001111");
    expect(
      buildImportRows(reversed, { 0: "firstName", 1: "fullName", 2: "phone" }).rows[0].firstName,
    ).toBe("Janet");
  });

  it("keeps both columns when two are mapped to notes", () => {
    const parsed = parseCsv("Company,Comment,Phone\nAcme Roofing,Owner is Jane,5550001111");
    const { rows } = buildImportRows(parsed, { 0: "notes", 1: "notes", 2: "phone" });
    expect(rows[0].notes).toBe("Acme Roofing · Owner is Jane");
  });

  it("ignores columns that were left unmapped", () => {
    const parsed = parseCsv("First,Junk,Phone\nJane,DELETE ME,5550001111");
    const { rows } = buildImportRows(parsed, { 0: "firstName", 2: "phone" });
    expect(JSON.stringify(rows[0])).not.toContain("DELETE ME");
  });
});
