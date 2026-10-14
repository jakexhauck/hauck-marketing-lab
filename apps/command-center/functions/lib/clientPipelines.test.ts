import { describe, it, expect } from "vitest";
import { isAgencyPipeline, clientVisiblePipelines } from "./clientPipelines";

describe("isAgencyPipeline", () => {
  it("catches the agency's own outbound board", () => {
    expect(isAgencyPipeline("Cold Calling")).toBe(true);
    expect(isAgencyPipeline("cold calling")).toBe(true);
    expect(isAgencyPipeline("3) Cold Calling")).toBe(true);
    // GHL pipeline names routinely carry emoji and doubled spaces.
    expect(isAgencyPipeline("Cold  Calling 📞")).toBe(true);
    expect(isAgencyPipeline("ColdCall")).toBe(true);
  });

  it("leaves every real client board alone", () => {
    for (const name of ["Leads", "No Answer", "Sales", "Trash", "Customers"]) {
      expect(isAgencyPipeline(name)).toBe(false);
    }
  });

  it("does not throw on a missing name", () => {
    expect(isAgencyPipeline(null)).toBe(false);
    expect(isAgencyPipeline(undefined)).toBe(false);
    expect(isAgencyPipeline("")).toBe(false);
  });
});

describe("clientVisiblePipelines", () => {
  it("removes the agency board and keeps the order of the rest", () => {
    const rows = [
      { id: "a", name: "1) Leads" },
      { id: "b", name: "Cold Calling" },
      { id: "c", name: "3) Sales" },
    ];
    expect(clientVisiblePipelines(rows).map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("returns everything when there is no agency board", () => {
    const rows = [{ id: "a", name: "Leads" }];
    expect(clientVisiblePipelines(rows)).toHaveLength(1);
  });
});
