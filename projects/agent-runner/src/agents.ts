// The seven agents, in rail order, the same list as
// apps/command-center/src/lib/agents.ts. `folder` is the agent's brain folder
// under vault/Agents/: the rail name without " Agent", so the Manager's brain is
// vault/Agents/Manager/Brain.md exactly as the plan names it.

import type { AgentId } from "./wire.ts";

export interface AgentDef {
  id: AgentId;
  name: string;
  folder: string;
}

export const AGENTS: AgentDef[] = [
  { id: "manager", name: "Manager Agent", folder: "Manager" },
  { id: "research", name: "Market Research Agent", folder: "Market Research" },
  { id: "ads", name: "Ads Agent", folder: "Ads" },
  { id: "creative", name: "Creative Agent", folder: "Creative" },
  { id: "landing", name: "Landing Page Agent", folder: "Landing Page" },
  { id: "ghl", name: "GHL Agent", folder: "GHL" },
  { id: "reporting", name: "Reporting Agent", folder: "Reporting" },
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
