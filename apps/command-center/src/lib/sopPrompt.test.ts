import { describe, expect, it } from "vitest";
import { AGENT_SOPS, getAgentSop, type AgentSop } from "./agentSops";
import { mapStages, sopForAgent } from "./sopPrompt";

describe("mapStages", () => {
  it("walks the main line in order and splits after each Jake approves box", () => {
    const s = mapStages(getAgentSop("ghl")!);
    expect(s[0].tasks.map((t) => t.name).slice(0, 2)).toEqual(["sub-account", "staff added"]);
    expect(s[0].tasks.filter((t) => !t.name.includes("(only when") && !t.name.startsWith("Hand off") && !t.name.startsWith("From ")).at(-1)!.name).toBe("Jake review");
    expect(s[1].tasks.map((t) => t.name)).toContain("publish + test");
  });

  it("maps box kinds to owners", () => {
    const t = mapStages(getAgentSop("ghl")!).flatMap((x) => x.tasks);
    expect(t.find((x) => x.name === "connect facebook")!.owner).toBe("jake");
    expect(t.find((x) => x.name === "sub-account")!.owner).toBe("agent");
    expect(t.find((x) => x.name === "Jake review")!.owner).toBe("jake");
    expect(t.find((x) => x.name === "Jake review")!.steps[0]).toBe("File a needs_ok card and wait for Jake's Approve");
  });

  it("attaches side doors to the stage they branch from", () => {
    expect(mapStages(getAgentSop("ghl")!)[0].tasks.map((x) => x.name)).toContain("A2P rejected (only when sent here)");
  });

  it("names handoffs after the map they open", () => {
    const t = mapStages(getAgentSop("ghl")!).flatMap((x) => x.tasks).map((x) => x.name);
    expect(t).toContain("Hand off to Manager: back to Manager");
  });

  it("names a box that only brings work in as coming from that map", () => {
    const ghl = mapStages(getAgentSop("ghl")!).flatMap((x) => x.tasks).map((x) => x.name);
    expect(ghl).toContain("From Ads: Ads Agent");
    expect(ghl).not.toContain("Hand off to Ads: Ads Agent");
    expect(mapStages(getAgentSop("ads")!)[0].tasks[0].name).toBe("From Market Research: research in");
  });

  it("uses steps, else the box lines", () => {
    const t = mapStages(getAgentSop("landing")!).flatMap((x) => x.tasks);
    expect(t.find((x) => x.name === "recent work page")!.steps).toEqual(["job photos + reviews"]);
  });

  it("marks draft maps", () => {
    expect(mapStages(getAgentSop("creative")!).every((s) => s.draft)).toBe(true);
    expect(mapStages(getAgentSop("ghl")!).some((s) => s.draft)).toBe(false);
  });

  it("never loops or drops a box on any map", () => {
    for (const m of AGENT_SOPS) expect(mapStages(m).flatMap((s) => s.tasks), m.id).toHaveLength(m.nodes.length);
  });

  it("survives a main line that loops back", () => {
    const base = getAgentSop("landing")!;
    const m: AgentSop = { ...base, edges: [...base.edges, ["sms", "brief", "again"]] };
    expect(mapStages(m).flatMap((s) => s.tasks)).toHaveLength(base.nodes.length);
  });

  it("a map with no review box is one stage", () => {
    const base = getAgentSop("landing")!;
    const m: AgentSop = { ...base, nodes: base.nodes.map((n) => ({ ...n, k: n.k === "review" ? "agent" : n.k })) };
    expect(mapStages(m)).toHaveLength(1);
  });
});

describe("sopForAgent", () => {
  it("gives each agent only its own map, so no journey is listed twice", () => {
    expect(sopForAgent("manager")).toEqual(mapStages(getAgentSop("manager")!));
    expect(sopForAgent("ghl")).toEqual(mapStages(getAgentSop("ghl")!));
  });
});
