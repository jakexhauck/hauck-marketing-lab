import { describe, it, expect } from "vitest";
import { personTopic, tenantPresenceTopic, presenceId } from "./chatClient";

describe("personTopic", () => {
  it("formats a staff person topic", () => {
    expect(personTopic("staff", "abc")).toBe("chat:person:staff:abc");
  });
  it("formats an admin person topic", () => {
    expect(personTopic("admin", "jake")).toBe("chat:person:admin:jake");
  });
});

describe("tenantPresenceTopic", () => {
  it("formats the tenant presence topic", () => {
    expect(tenantPresenceTopic("t1")).toBe("chat:presence:t1");
  });
});

describe("presenceId", () => {
  it("joins kind and id with a colon", () => {
    expect(presenceId("staff", "abc")).toBe("staff:abc");
  });
});
