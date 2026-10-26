import { describe, expect, it } from "vitest";
import {
  baseChecks,
  calendarsCheck,
  ownerLinksCheck,
  ownerPhoneCheck,
  pipelineCheck,
  sortChecks,
  textingCheck,
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
    expect(calendarsCheck([cal("1", "Home Estimate")]).detail).toBe("Missing: Job");
  });
  it("names calendars with nobody on them", () => {
    expect(
      calendarsCheck([cal("1", "Home Estimate"), cal("2", "Job", 0)]).detail,
    ).toBe("No team member: Job");
  });
  it("is green when Home Estimate and Job have a team member, with no Conversion Asset Calendar", () => {
    expect(calendarsCheck([cal("1", "Home Estimate"), cal("2", "Jobs")]).state).toBe("ok");
  });
  it("asks nothing of an event calendar, which GHL keeps unassigned", () => {
    // GHL's API takes team members only on round robin, collective, class,
    // service and personal calendars; on an event calendar it drops them
    // without an error (tried live 2026-10-26). Every client's snapshot
    // Home Estimate and Job are event calendars.
    const event = (id: string, name: string) => ({ id, name, calendarType: "event", teamMembers: [] });
    expect(calendarsCheck([event("1", "Home Estimate"), event("2", "Job")]).state).toBe("ok");
    expect(
      calendarsCheck([event("1", "Home Estimate"), { ...cal("2", "Job", 0), calendarType: "round_robin" }]).detail,
    ).toBe("No team member: Job");
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
  it("flags an app install missing a permission the app now asks for", () => {
    expect(baseChecks({ ...facts, ghl: "stale" })[0]).toMatchObject({
      state: "missing",
      detail: "Reinstall the app: missing permissions",
    });
  });
  it("sorts into page order", () => {
    const ids = sortChecks(baseChecks(facts)).map((c) => c.id);
    expect(ids).toEqual(["ghl", "meta-ads", "meta-page", "login", "push"]);
  });
});

describe("textingCheck", () => {
  it("is red when the key lacks the send permission", () => {
    expect(
      textingCheck({ status: 401, body: '{"statusCode":401,"message":"The token is not authorized for this scope."}' }),
    ).toMatchObject({ state: "missing", detail: "Missing send permission" });
  });
  it("is red when GHL refuses the key outright", () => {
    expect(textingCheck({ status: 403, body: "Forbidden" })).toMatchObject({ state: "missing", detail: "GHL refused the send" });
  });
  it("is green when GHL gets as far as checking the empty message", () => {
    expect(textingCheck({ status: 422, body: '{"message":["contactId must be a string"]}' }).state).toBe("ok");
    expect(textingCheck({ status: 400, body: "Bad Request" }).state).toBe("ok");
  });
  it("is unknown when GHL did not answer", () => {
    expect(textingCheck(null).state).toBe("unknown");
    expect(textingCheck({ status: 502, body: "" }).state).toBe("unknown");
  });
});
