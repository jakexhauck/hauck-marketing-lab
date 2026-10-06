import { describe, it, expect } from "vitest";
import { companyPairs } from "./docFill";

describe("companyPairs", () => {
  it("fills every spelling of the company-name spot", () => {
    expect(companyPairs(" Willis Windows ").map((p) => p.find)).toEqual([
      "[Company Name]",
      "{{Company Name}}",
      "[Client Name]",
      "[Business Name]",
    ]);
    expect(companyPairs("Willis Windows").every((p) => p.replace === "Willis Windows")).toBe(true);
  });

  it("never touches the spots said live on a call", () => {
    expect(companyPairs("AAG").some((p) => /first name|your name/i.test(p.find))).toBe(false);
  });

  it("does nothing without a name", () => {
    expect(companyPairs("  ")).toEqual([]);
  });
});
