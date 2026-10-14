import { describe, expect, it } from "vitest";
import {
  baseChecks,
  calendarsCheck,
  ownerLinksCheck,
  ownerPhoneCheck,
  pipelineCheck,
  sortChecks,
  type AccountFacts,
} from "./clientAccounts";

const stages = (...names: string[]) => names.map((name, i) => ({ id: `s${i}`, name, position: i }));
const CORE = ["Lead", "Estimate Booked", "Job Booked", "Job Completed", "Follow Up", "Lost"];

describe("pipelineCheck", () => {
  it("is red with no board pipeline", () => {
    expect(pipelineCheck([{ id: "p", name: "1) Leads", stages: stages("New", "Trash") }])).toMatchObject({
      state: "missing",
      detail: "No Sales Pipeline",
    });
  });
  it("is red without a No Answer stage", () => {
    expect(pipelineCheck([{ id: "p", name: "Sales Pipeline", stages: stages(...CORE) }]).detail).toBe(
      "No Answer stage missing",
    );
  });
  it("is green with every stage", () => {
    expect(pipelineCheck([{ id: "p", name: "Sales Pipeline", stages: stages(...CORE, "No Answer") }]).state).toBe("ok");
  });
});

describe("calendarsCheck", () => {
  const cal = (id: string, name: string, members = 1) => ({
    id,
    name,
    teamMembers: Array.from({ length: members }, () => ({ userId: "u" })),
  });
  it("names the missing calendars", () => {
    expect(calendarsCheck([cal("1", "Home Estimate")]).detail).toBe("Missing: Job, Conversion Asset Calendar");
  });
  it("names calendars with nobody on them", () => {
    expect(
      calendarsCheck([cal("1", "Home Estimate"), cal("2", "Job", 0), cal("3", "Conversion Asset Calendar")]).detail,
    ).toBe("No team member: Job");
  });
  it("ignores a switched-off calendar", () => {
    const off = { ...cal("3", "Conversion Asset Calendar"), isActive: false };
    expect(calendarsCheck([cal("1", "Home Estimate"), cal("2", "Job"), off]).state).toBe("missing");
  });
  it("is green when all three have a team member", () => {
    expect(
      calendarsCheck([cal("1", "Home Estimate"), cal("2", "Jobs"), cal("3", "conversion asset  calendar")]).state,
    ).toBe("ok");
  });
});

describe("ownerLinksCheck", () => {
  const expected = [
    { name: "Call Now Link", value: "a" },
    { name: "Lead Outcome Link", value: "b" },
  ];
  it("names a missing value", () => {
    expect(ownerLinksCheck([{ name: "Call Now Link", value: "a" }], expected).detail).toBe("Missing: Lead Outcome Link");
  });
  it("names a stale value", () => {
    expect(
      ownerLinksCheck(
        [
          { name: "call now link", value: "a" },
          { name: "Lead Outcome Link", value: "old" },
        ],
        expected,
      ).detail,
    ).toBe("Wrong: Lead Outcome Link");
  });
  it("is green when every value matches", () => {
    expect(ownerLinksCheck([...expected, { name: "Other", value: "x" }], expected).state).toBe("ok");
  });
});

describe("ownerPhoneCheck", () => {
  it("needs a user with a real number", () => {
    expect(ownerPhoneCheck([]).detail).toBe("No users");
    expect(ownerPhoneCheck([{ phone: "" }, { phone: "555" }]).detail).toBe("No user has a phone");
    expect(ownerPhoneCheck([{ phone: "+1 (313) 555-0100" }]).state).toBe("ok");
  });
});

describe("baseChecks", () => {
  const facts: AccountFacts = {
    ghl: "app",
    metaAdAccountId: "act_1",
    metaPageId: "123456",
    hasLogin: true,
    pushDevices: 2,
  };
  it("is all green for a wired client", () => {
    expect(baseChecks(facts).every((c) => c.state === "ok")).toBe(true);
  });
  it("flags an old pasted token as not on the Marketplace app", () => {
    expect(baseChecks({ ...facts, ghl: "token" })[0]).toMatchObject({ state: "missing" });
  });
  it("sorts into page order", () => {
    const ids = sortChecks(baseChecks(facts)).map((c) => c.id);
    expect(ids).toEqual(["ghl", "meta-ads", "meta-page", "login", "push"]);
  });
});
