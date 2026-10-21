import { describe, it, expect } from "vitest";
import type { AgentLesson } from "./agentWire";
import { AGENTS } from "./agents";
import { graphFor, type GraphClient } from "./brainGraph";

const clients: GraphClient[] = [
  { id: "t1", name: "Willis", color: "#2f6fde" },
  { id: "t2", name: "Made Better", color: "#e0702b" },
  { id: "t3", name: "Above All", color: "#16a34a" },
];

const lesson = (id: string, over: Partial<AgentLesson> = {}): AgentLesson => ({
  id,
  scope: "client",
  tenantId: "t1",
  agent: "ads",
  text: `Lesson ${id}`,
  source: "chat",
  learnedOn: "2026-10-17",
  ...over,
});

const lessons = [
  lesson("l-1"),
  lesson("l-2", { tenantId: "t2", agent: "csm" }),
  lesson("l-3", { scope: "agent", tenantId: null, agent: "ghl" }),
  lesson("l-4", { scope: "manager", tenantId: null, agent: "manager" }),
  lesson("l-5", { tenantId: "gone", agent: "ads" }),
];

function noDangling(g: ReturnType<typeof graphFor>) {
  const ids = new Set(g.nodes.map((n) => n.id));
  for (const l of g.links) {
    expect(ids.has(l.source)).toBe(true);
    expect(ids.has(l.target)).toBe(true);
  }
}

describe("graphFor", () => {
  it("client scope has exactly one client node", () => {
    const g = graphFor(lessons, clients, AGENTS, "client", { tenantId: "t1", agent: "ads" });
    expect(g.nodes.filter((n) => n.kind === "client").map((n) => n.id)).toEqual(["c-t1"]);
    expect(g.nodes.filter((n) => n.kind === "lesson")).toHaveLength(lessons.length);
    noDangling(g);
  });

  it("agent scope has every client and only this agent", () => {
    const g = graphFor(lessons, clients, AGENTS, "agent", { tenantId: "t1", agent: "ads" });
    expect(g.nodes.filter((n) => n.kind === "client")).toHaveLength(3);
    expect(g.nodes.filter((n) => n.kind === "agent").map((n) => n.id)).toEqual(["a-ads"]);
    noDangling(g);
  });

  it("mega has every client and agent, and the Manager links to every client", () => {
    const g = graphFor(lessons, clients, AGENTS, "mega", { tenantId: null, agent: "manager" });
    expect(g.nodes.filter((n) => n.kind === "client")).toHaveLength(3);
    expect(g.nodes.filter((n) => n.kind === "agent")).toHaveLength(5);
    const fromManager = g.links.filter((l) => l.source === "a-manager" && l.target.startsWith("c-"));
    expect(fromManager.map((l) => l.target).sort()).toEqual(["c-t1", "c-t2", "c-t3"]);
    noDangling(g);
  });

  it("links a lesson to its client and its agent", () => {
    const g = graphFor([lesson("l-1")], clients, AGENTS, "mega", { tenantId: null, agent: "manager" });
    const own = g.links.filter((l) => l.source === "n-l-1").map((l) => l.target).sort();
    expect(own).toEqual(["a-ads", "c-t1"]);
  });

  it("never points at a missing node", () => {
    noDangling(graphFor(lessons, clients, AGENTS, "client", { tenantId: "t2", agent: "csm" }));
    noDangling(graphFor(lessons, [], AGENTS, "client", { tenantId: null, agent: "ads" }));
  });
});
