import { describe, expect, it } from "vitest";
import { stateAliases, stateCode } from "./usStates";

// The join behind Leads > Cities rests entirely on these two, because the same
// state is spelled three ways across the system: the cities sheet says
// "Michigan", lead_metros says "MI", and a scraped lead's state column holds
// whichever Google returned.

describe("stateCode", () => {
  it("maps a full name to its code", () => {
    expect(stateCode("Michigan")).toBe("MI");
    expect(stateCode("new york")).toBe("NY");
    expect(stateCode("District of Columbia")).toBe("DC");
  });

  it("passes a code straight through, upper-cased", () => {
    expect(stateCode("mi")).toBe("MI");
    expect(stateCode("TX")).toBe("TX");
  });

  it("returns empty for anything it does not know, rather than guessing", () => {
    // A guess here would attach a city to the wrong state's coverage, which is
    // worse than showing it as untouched.
    expect(stateCode("Ontario")).toBe("");
    expect(stateCode("")).toBe("");
    expect(stateCode("   ")).toBe("");
  });
});

describe("stateAliases", () => {
  it("offers both spellings so a mixed column still matches", () => {
    expect(stateAliases("Michigan", "MI")).toEqual(["michigan", "mi"]);
  });

  it("drops an empty side rather than emitting a blank alias", () => {
    // A blank alias would match every lead whose state was never recorded.
    expect(stateAliases("Michigan", "")).toEqual(["michigan"]);
  });
});
