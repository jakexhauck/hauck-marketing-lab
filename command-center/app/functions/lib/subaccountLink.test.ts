import { describe, expect, it } from "vitest";
import { annotateLocations, linkBlocker, suggestLocationId } from "./subaccountLink";

const tenants = [
  { id: "t-willis", name: "Willis Windows", ghl_location_id: "LOC_W" },
  { id: "t-new", name: "Acme Roofing", ghl_location_id: "pending" },
];

const raw = [
  { id: "LOC_W", name: "Willis Windows" },
  { id: "LOC_A", name: "Acme Roofing LLC" },
];

describe("annotateLocations", () => {
  it("marks the client holding each location, sorted by name", () => {
    expect(annotateLocations(raw, tenants)).toEqual([
      { id: "LOC_A", name: "Acme Roofing LLC", linkedTenantId: null, linkedTenantName: null },
      {
        id: "LOC_W",
        name: "Willis Windows",
        linkedTenantId: "t-willis",
        linkedTenantName: "Willis Windows",
      },
    ]);
  });

  it("treats a placeholder location as holding nothing", () => {
    const out = annotateLocations([{ id: "pending", name: "Odd one" }], tenants);
    expect(out[0].linkedTenantId).toBeNull();
  });
});

describe("suggestLocationId", () => {
  const opts = annotateLocations(raw, tenants);

  it("picks the unlinked location whose name matches the business", () => {
    expect(suggestLocationId(opts, "Acme Roofing")).toBe("LOC_A");
  });

  it("never suggests one another client already holds", () => {
    expect(suggestLocationId(opts, "Willis Windows")).toBeNull();
  });

  it("is null when nothing matches", () => {
    expect(suggestLocationId(opts, "Zebra Plumbing")).toBeNull();
  });

  it("is null for an empty business name", () => {
    expect(suggestLocationId(opts, "   ")).toBeNull();
  });
});

describe("linkBlocker", () => {
  it("refuses a location another client holds, naming them", () => {
    expect(linkBlocker("t-new", "LOC_W", tenants)).toMatch(/Willis Windows/);
  });

  it("allows relinking a client to the location it already holds", () => {
    expect(linkBlocker("t-willis", "LOC_W", tenants)).toBeNull();
  });

  it("allows a free location", () => {
    expect(linkBlocker("t-new", "LOC_A", tenants)).toBeNull();
  });

  it("refuses an empty location", () => {
    expect(linkBlocker("t-new", "   ", tenants)).not.toBeNull();
  });
});
