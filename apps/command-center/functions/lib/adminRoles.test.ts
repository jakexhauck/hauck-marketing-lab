import { describe, expect, it } from "vitest";
import { canAdminAccess, isAdminRole, ADMIN_ROLE_SPECS } from "./adminRoles";

describe("isAdminRole", () => {
  it("accepts the three real roles", () => {
    expect(isAdminRole("owner")).toBe(true);
    expect(isAdminRole("cold_caller")).toBe(true);
    expect(isAdminRole("setter")).toBe(true);
  });

  it("rejects anything else, including near-misses from a hand-typed body", () => {
    expect(isAdminRole("admin")).toBe(false);
    expect(isAdminRole("Owner")).toBe(false);
    expect(isAdminRole("cold-caller")).toBe(false);
    expect(isAdminRole("")).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
    expect(isAdminRole(null)).toBe(false);
  });
});

describe("canAdminAccess", () => {
  it("lets an owner through everything", () => {
    expect(canAdminAccess("/api/admin/clients", "DELETE", "owner")).toBe(true);
    expect(canAdminAccess("/api/admin/team", "POST", "owner")).toBe(true);
    expect(canAdminAccess("/api/admin/anything/new", "PATCH", "owner")).toBe(true);
  });

  it("gives a cold caller his list and his numbers", () => {
    expect(canAdminAccess("/api/admin/tracker/leads", "GET", "cold_caller")).toBe(true);
    expect(canAdminAccess("/api/admin/tracker/leads", "PATCH", "cold_caller")).toBe(true);
    expect(canAdminAccess("/api/admin/tracker/cold-calls", "POST", "cold_caller")).toBe(
      true,
    );
  });

  it("does not let a cold caller add or delete rows from the prospect book", () => {
    // Jake supplies the leads. The caller works them, he does not source them.
    expect(canAdminAccess("/api/admin/tracker/leads", "POST", "cold_caller")).toBe(false);
    expect(canAdminAccess("/api/admin/tracker/leads", "DELETE", "cold_caller")).toBe(
      false,
    );
  });

  it("lets a cold caller read the dialing script but never rewrite it", () => {
    expect(canAdminAccess("/api/admin/cold-call/assets", "GET", "cold_caller")).toBe(true);
    expect(canAdminAccess("/api/admin/cold-call/assets", "PATCH", "cold_caller")).toBe(false);
  });

  it("lets a cold caller book on the agency calendar", () => {
    expect(canAdminAccess("/api/admin/cold-call/calendars", "GET", "cold_caller")).toBe(true);
    expect(canAdminAccess("/api/admin/cold-call/slots", "GET", "cold_caller")).toBe(true);
    expect(canAdminAccess("/api/admin/cold-call/book", "POST", "cold_caller")).toBe(true);
    // Reading a calendar list is not permission to change one.
    expect(canAdminAccess("/api/admin/cold-call/calendars", "PATCH", "cold_caller")).toBe(
      false,
    );
    expect(canAdminAccess("/api/admin/cold-call/book", "DELETE", "cold_caller")).toBe(false);
  });

  it("lets a cold caller read and write their own availability", () => {
    expect(
      canAdminAccess("/api/admin/cold-call/availability", "GET", "cold_caller"),
    ).toBe(true);
    expect(
      canAdminAccess("/api/admin/cold-call/availability", "PUT", "cold_caller"),
    ).toBe(true);
    // No bulk edit and no wiping a week: the handler only replaces one named
    // day, and nothing here opens a route that does more.
    expect(
      canAdminAccess("/api/admin/cold-call/availability", "DELETE", "cold_caller"),
    ).toBe(false);
    expect(
      canAdminAccess("/api/admin/cold-call/availability", "POST", "cold_caller"),
    ).toBe(false);
    // EXACT: a sub-route added under this path later is shut until someone
    // deliberately opens it.
    expect(
      canAdminAccess("/api/admin/cold-call/availability/team", "GET", "cold_caller"),
    ).toBe(false);
  });

  it("keeps a setter out of cold-call availability", () => {
    expect(canAdminAccess("/api/admin/cold-call/availability", "GET", "setter")).toBe(
      false,
    );
  });

  it("keeps a cold caller out of clients, money and the team page", () => {
    expect(canAdminAccess("/api/admin/clients", "GET", "cold_caller")).toBe(false);
    expect(canAdminAccess("/api/admin/team", "GET", "cold_caller")).toBe(false);
    expect(canAdminAccess("/api/admin/team", "POST", "cold_caller")).toBe(false);
    expect(canAdminAccess("/api/admin/tracker/sales-data", "GET", "cold_caller")).toBe(
      false,
    );
    expect(canAdminAccess("/api/admin/tracker/business-health", "GET", "cold_caller")).toBe(
      false,
    );
    expect(canAdminAccess("/api/admin/audit", "GET", "cold_caller")).toBe(false);
    expect(canAdminAccess("/api/admin/setter/leads", "GET", "cold_caller")).toBe(false);
  });

  it("matches on path segments, not string prefixes", () => {
    // A future /api/admin/tracker/leads-export must NOT inherit the leads rule.
    expect(canAdminAccess("/api/admin/tracker/leads-export", "GET", "cold_caller")).toBe(
      false,
    );
    // A deeper path under a non-exact allowed prefix is still allowed.
    expect(canAdminAccess("/api/admin/setter/lead/abc-123", "PATCH", "setter")).toBe(true);
  });

  it("does not let a cold caller hand himself work", () => {
    // The leads rule is EXACT: handing leads out is the owner's, and the
    // sub-routes that do it must not be inherited from the queue he may read.
    expect(canAdminAccess("/api/admin/tracker/leads/assign", "PATCH", "cold_caller")).toBe(
      false,
    );
    expect(canAdminAccess("/api/admin/tracker/leads/import", "POST", "cold_caller")).toBe(
      false,
    );
    expect(canAdminAccess("/api/admin/tracker/leads/anything", "GET", "cold_caller")).toBe(
      false,
    );
    // His own queue still works.
    expect(canAdminAccess("/api/admin/tracker/leads", "PATCH", "cold_caller")).toBe(true);
  });

  it("is case-insensitive on the method only", () => {
    expect(canAdminAccess("/api/admin/tracker/leads", "get", "cold_caller")).toBe(true);
    expect(canAdminAccess("/API/ADMIN/TRACKER/LEADS", "GET", "cold_caller")).toBe(false);
  });

  it("denies a role with no rules rather than falling open", () => {
    // Defensive: an unknown role arriving from a hand-edited database row.
    expect(canAdminAccess("/api/admin/tracker/leads", "GET", "ghost" as never)).toBe(false);
  });

  it("gives a setter the suite and a read-only client list", () => {
    expect(canAdminAccess("/api/admin/setter/leads", "GET", "setter")).toBe(true);
    expect(canAdminAccess("/api/admin/setter/book", "POST", "setter")).toBe(true);
    expect(canAdminAccess("/api/admin/clients", "GET", "setter")).toBe(true);
    expect(canAdminAccess("/api/admin/clients", "PATCH", "setter")).toBe(false);
  });
});

describe("ADMIN_ROLE_SPECS", () => {
  it("describes every role the picker offers", () => {
    for (const role of ["owner", "cold_caller", "setter"] as const) {
      const spec = ADMIN_ROLE_SPECS[role];
      expect(spec.role).toBe(role);
      expect(spec.label.length).toBeGreaterThan(0);
      expect(spec.sees.length).toBeGreaterThan(0);
    }
  });

  it("spells out what a hire cannot reach, so the leash is readable", () => {
    expect(ADMIN_ROLE_SPECS.cold_caller.denied).toContain("Client accounts");
    expect(ADMIN_ROLE_SPECS.owner.denied).toHaveLength(0);
  });
});
