import { describe, it, expect } from "vitest";
import { AGENTS, agentPath, isAgentId } from "./agents";

describe("AGENTS", () => {
  it("lists the seven agents in rail order", () => {
    expect(AGENTS.map((a) => a.id)).toEqual(["manager", "research", "ads", "creative", "landing", "ghl", "reporting"]);
    expect(AGENTS.map((a) => a.name)).toEqual([
      "Manager Agent",
      "Market Research Agent",
      "Ads Agent",
      "Creative Agent",
      "Landing Page Agent",
      "GHL Agent",
      "Reporting Agent",
    ]);
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
