import { describe, expect, it } from "vitest";
import { parseAgentList } from "../src/agents.ts";

describe("parseAgentList", () => {
  it("is every agent when unset or blank", () => {
    expect(parseAgentList(undefined)).toBeUndefined();
    expect(parseAgentList("  ")).toBeUndefined();
  });

  it("reads a comma list, trimmed and without repeats", () => {
    expect(parseAgentList(" manager, csm ,csm")).toEqual(["manager", "csm"]);
  });

  it("is no agent at all for none", () => {
    expect(parseAgentList("none")).toEqual([]);
    expect(parseAgentList(" None ")).toEqual([]);
  });

  it("refuses a name it does not know", () => {
    expect(() => parseAgentList("csm,cms")).toThrow(/unknown agents: cms/);
  });
});
