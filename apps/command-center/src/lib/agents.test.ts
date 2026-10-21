import { describe, it, expect } from "vitest";
import { AGENTS, CLIENT_AGENTS, agentPath, isAgentId } from "./agents";

describe("AGENTS", () => {
  it("lists the five agents in rail order, the agency Manager last", () => {
    expect(AGENTS.map((a) => a.id)).toEqual(["csm", "research", "ads", "ghl", "manager"]);
    expect(AGENTS.map((a) => a.name)).toEqual([
      "Customer Success Manager",
      "Market Research Agent",
      "Ads Agent",
      "GHL Agent",
      "Manager Agent",
    ]);
  });

  it("gives a client every agent but the agency Manager", () => {
    expect(CLIENT_AGENTS.map((a) => a.id)).toEqual(["csm", "research", "ads", "ghl"]);
  });

  it("no longer knows the retired agents", () => {
    for (const id of ["creative", "landing", "reporting"]) expect(isAgentId(id)).toBe(false);
  });

  it("knows its own ids", () => {
    expect(isAgentId("ads")).toBe(true);
    expect(isAgentId("nope")).toBe(false);
    expect(isAgentId("")).toBe(false);
  });
});

describe("agentPath", () => {
  it("puts the agency Manager on its own address", () => {
    expect(agentPath(null, "manager")).toBe("/admin/agents/manager");
  });

  it("puts a client's agent under that client", () => {
    expect(agentPath("t1", "ads")).toBe("/admin/client/t1/agent/ads");
  });
});
