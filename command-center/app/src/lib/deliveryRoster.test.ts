import { describe, expect, it } from "vitest";
import type { AdminClient } from "./api";
import { filterRoster, matchesRosterSearch } from "./deliveryRoster";

function mk(overrides: Partial<AdminClient>): AdminClient {
  return {
    id: "t1",
    slug: "willis",
    name: "Willis Exteriors",
    niche: "Roofing & Exteriors",
    brandColor: "#6366f1",
    brandInitials: "WE",
    appName: "Willis",
    ghlLocationId: "loc",
    ghlConnected: true,
    metaAdAccountId: null,
    monthlySpend: 4200,
    memberCount: 3,
    createdAt: "2026-01-01T00:00:00Z",
    healthStatus: "healthy",
    healthNote: null,
    onboardingStatus: "live",
    ...overrides,
  };
}

describe("matchesRosterSearch", () => {
  it("matches by name, case-insensitive", () => {
    expect(matchesRosterSearch({ name: "Willis Exteriors", niche: "Roofing" }, "willis")).toBe(
      true,
    );
  });

  it("matches by niche", () => {
    expect(matchesRosterSearch({ name: "Willis Exteriors", niche: "Roofing" }, "roof")).toBe(
      true,
    );
  });

  it("returns true for an empty query", () => {
    expect(matchesRosterSearch({ name: "Willis Exteriors", niche: "Roofing" }, "")).toBe(true);
    expect(matchesRosterSearch({ name: "Willis Exteriors", niche: "Roofing" }, "   ")).toBe(true);
  });

  it("returns false when neither field matches", () => {
    expect(matchesRosterSearch({ name: "Willis Exteriors", niche: "Roofing" }, "dental")).toBe(
      false,
    );
  });
});

describe("filterRoster", () => {
  const willis = mk({ id: "willis", name: "Willis Exteriors", niche: "Roofing" });
  const bluepeak = mk({ id: "bluepeak", name: "BluePeak Plumbing", niche: "Plumbing" });
  const nova = mk({ id: "nova", name: "Nova Med Spa", niche: "Med Spa" });
  const rows = [willis, bluepeak, nova];

  it("narrows to the search match, preserving order", () => {
    expect(filterRoster(rows, "plumb")).toEqual([bluepeak]);
  });

  it("returns every client for an empty query", () => {
    expect(filterRoster(rows, "")).toEqual(rows);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterRoster(rows, "zzz")).toEqual([]);
  });
});
