import { describe, expect, it } from "vitest";
import type { AdminClient } from "./api";
import {
  ROSTER_FILTERS,
  atRiskClients,
  filterRoster,
  healthDotClass,
  healthLabel,
  isAtRisk,
  matchesRosterFilter,
  matchesRosterSearch,
} from "./deliveryRoster";

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
    monthlySpend: 4200,
    memberCount: 3,
    createdAt: "2026-01-01T00:00:00Z",
    healthStatus: "healthy",
    healthNote: null,
    ...overrides,
  };
}

describe("healthLabel", () => {
  it("maps every status to its roster label", () => {
    expect(healthLabel("healthy")).toBe("Healthy");
    expect(healthLabel("warn")).toBe("Needs attention");
    expect(healthLabel("paused")).toBe("Paused");
  });
});

describe("healthDotClass", () => {
  it("maps every status to a distinct dot class", () => {
    expect(healthDotClass("healthy")).toBe("pk-roster-dot-healthy");
    expect(healthDotClass("warn")).toBe("pk-roster-dot-warn");
    expect(healthDotClass("paused")).toBe("pk-roster-dot-paused");
  });
});

describe("isAtRisk", () => {
  it("flags warn and paused, not healthy", () => {
    expect(isAtRisk("warn")).toBe(true);
    expect(isAtRisk("paused")).toBe(true);
    expect(isAtRisk("healthy")).toBe(false);
  });
});

describe("matchesRosterFilter", () => {
  it("'all' matches every status", () => {
    expect(matchesRosterFilter("healthy", "all")).toBe(true);
    expect(matchesRosterFilter("warn", "all")).toBe(true);
    expect(matchesRosterFilter("paused", "all")).toBe(true);
  });

  it("'attention' matches warn and paused only", () => {
    expect(matchesRosterFilter("warn", "attention")).toBe(true);
    expect(matchesRosterFilter("paused", "attention")).toBe(true);
    expect(matchesRosterFilter("healthy", "attention")).toBe(false);
  });

  it("'healthy' and 'paused' match their exact status", () => {
    expect(matchesRosterFilter("healthy", "healthy")).toBe(true);
    expect(matchesRosterFilter("warn", "healthy")).toBe(false);
    expect(matchesRosterFilter("paused", "paused")).toBe(true);
    expect(matchesRosterFilter("warn", "paused")).toBe(false);
  });

  it("covers every declared filter id", () => {
    expect(ROSTER_FILTERS.map((f) => f.id)).toEqual(["all", "attention", "healthy", "paused"]);
  });
});

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
  const willis = mk({ id: "willis", name: "Willis Exteriors", niche: "Roofing", healthStatus: "healthy" });
  const bluepeak = mk({ id: "bluepeak", name: "BluePeak Plumbing", niche: "Plumbing", healthStatus: "warn" });
  const nova = mk({ id: "nova", name: "Nova Med Spa", niche: "Med Spa", healthStatus: "paused" });
  const rows = [willis, bluepeak, nova];

  it("applies the health filter and search together", () => {
    expect(filterRoster(rows, "", "attention")).toEqual([bluepeak, nova]);
    expect(filterRoster(rows, "plumb", "all")).toEqual([bluepeak]);
    expect(filterRoster(rows, "plumb", "paused")).toEqual([]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterRoster(rows, "zzz", "all")).toEqual([]);
  });
});

describe("atRiskClients", () => {
  it("returns only warn/paused tenants, preserving order", () => {
    const healthy = mk({ id: "a", healthStatus: "healthy" });
    const warn = mk({ id: "b", healthStatus: "warn" });
    const paused = mk({ id: "c", healthStatus: "paused" });
    expect(atRiskClients([healthy, warn, paused])).toEqual([warn, paused]);
  });

  it("returns an empty array when every account is healthy", () => {
    expect(atRiskClients([mk({ healthStatus: "healthy" })])).toEqual([]);
  });
});
