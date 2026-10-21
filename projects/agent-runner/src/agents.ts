// The agents, in rail order, the same list as apps/command-center/src/lib/agents.ts
// (docs/build-plans/four-agents-and-handoffs.md). `folder` is the agent's brain
// folder under vault/Agents/. The Manager is agency only; the Customer Success
// Manager does its old work inside each client.

import type { AgentId } from "./wire.ts";

export interface AgentDef {
  id: AgentId;
  name: string;
  folder: string;
}

export const AGENTS: AgentDef[] = [
  { id: "csm", name: "Customer Success Manager", folder: "Customer Success Manager" },
  { id: "research", name: "Market Research Agent", folder: "Market Research" },
  { id: "ads", name: "Ads Agent", folder: "Ads" },
  { id: "ghl", name: "GHL Agent", folder: "GHL" },
  { id: "manager", name: "Manager Agent", folder: "Manager" },
];

export const AGENT_IDS: AgentId[] = AGENTS.map((a) => a.id);

export function isAgentId(s: unknown): s is AgentId {
  return typeof s === "string" && (AGENT_IDS as string[]).includes(s);
}

export function agentDef(id: AgentId): AgentDef {
  const def = AGENTS.find((a) => a.id === id);
  if (!def) throw new Error(`unknown agent ${id}`);
  return def;
}

// AGENT_AGENTS, the agents this runner answers ("manager,csm"). Unset or blank
// means every agent. A name it does not know stops the runner at start: a typo
// would otherwise leave that agent's messages queued with nobody to claim them.
export function parseAgentList(raw: string | undefined): AgentId[] | undefined {
  if (!raw?.trim()) return undefined;
  const names = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const bad = names.filter((n) => !isAgentId(n));
  if (bad.length) throw new Error(`AGENT_AGENTS has unknown agents: ${bad.join(", ")}`);
  return [...new Set(names)] as AgentId[];
}
