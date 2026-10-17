// The Brain tab's graph data (docs/build-plans/agents.md, Task 8): clients,
// agents and lessons as nodes, Obsidian style. Pure, so the scope rules are
// tested apart from d3.

import type { AgentDef, AgentId } from "./agents";
import type { AgentLesson } from "./agentWire";

export type BrainScope = "client" | "agent" | "mega";

export interface GraphClient {
  id: string;
  name: string;
  color: string;
}

export interface GraphNode {
  id: string;
  kind: "client" | "agent" | "lesson";
  label: string;
  r: number;
  // null: a lesson, drawn in the theme's faint text colour.
  color: string | null;
}

export interface GraphLink {
  source: string;
  target: string;
}

// One colour per agent, from the mockup. Lesson dots in the list use it too.
export const AGENT_COLORS: Record<AgentId, string> = {
  manager: "#8b5cf6",
  research: "#0ea5e9",
  ads: "#2f6fde",
  creative: "#ec4899",
  landing: "#14b8a6",
  ghl: "#f59e0b",
  reporting: "#64748b",
};

const LABEL_MAX = 22;

export function shortAgentName(name: string): string {
  return name.replace(/ Agent$/, "");
}

function lessonLabel(text: string): string {
  return text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX - 3).trimEnd()}...` : text;
}

// Client scope: this client and every working agent. Agent scope: every
// client and this agent. Mega: everyone, with the Manager tied to each client.
// A lesson links only to nodes that exist, so a lesson from a removed client
// floats rather than pointing at nothing.
export function graphFor(
  lessons: AgentLesson[],
  clients: GraphClient[],
  agents: AgentDef[],
  scope: BrainScope,
  ctx: { tenantId: string | null; agent: AgentId },
): { nodes: GraphNode[]; links: GraphLink[] } {
  const shownClients = scope === "client" ? clients.filter((c) => c.id === ctx.tenantId) : clients;
  const shownAgents =
    scope === "mega"
      ? agents
      : scope === "agent"
        ? agents.filter((a) => a.id === ctx.agent)
        : agents.filter((a) => a.id !== "manager");

  const nodes: GraphNode[] = [
    ...shownClients.map((c) => ({ id: `c-${c.id}`, kind: "client" as const, label: c.name, r: 13, color: c.color })),
    ...shownAgents.map((a) => ({
      id: `a-${a.id}`,
      kind: "agent" as const,
      label: shortAgentName(a.name),
      r: 10,
      color: AGENT_COLORS[a.id],
    })),
  ];
  const ids = new Set(nodes.map((n) => n.id));
  const links: GraphLink[] = [];

  for (const l of lessons) {
    const id = `n-${l.id}`;
    if (ids.has(id)) continue;
    nodes.push({ id, kind: "lesson", label: lessonLabel(l.text), r: 5, color: null });
    ids.add(id);
    if (l.tenantId && ids.has(`c-${l.tenantId}`)) links.push({ source: id, target: `c-${l.tenantId}` });
    if (ids.has(`a-${l.agent}`)) links.push({ source: id, target: `a-${l.agent}` });
  }

  if (scope === "mega" && ids.has("a-manager")) {
    for (const c of shownClients) links.push({ source: "a-manager", target: `c-${c.id}` });
  }
  return { nodes, links };
}
