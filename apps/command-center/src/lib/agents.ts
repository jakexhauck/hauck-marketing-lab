// The Agents section (Jake, 2026-10-17; docs/build-plans/agents.md).
//
// Seven service-delivery agents, the same for every client. This file is the
// one list of who they are, in rail order, and where each one lives. The ids
// are also the values migration 0166 checks, and the PC runner keys its
// instruction files by them, so an id never changes once shipped.
//
// The Manager is the only agent with an agency address as well as a client
// one: on the agency rail it overlooks every client at once.

export type AgentId = "manager" | "research" | "ads" | "creative" | "landing" | "ghl" | "reporting";

export interface AgentDef {
  id: AgentId;
  name: string;
}

export const AGENTS: AgentDef[] = [
  { id: "manager", name: "Manager Agent" },
  { id: "research", name: "Market Research Agent" },
  { id: "ads", name: "Ads Agent" },
  { id: "creative", name: "Creative Agent" },
  { id: "landing", name: "Landing Page Agent" },
  { id: "ghl", name: "GHL Agent" },
  { id: "reporting", name: "Reporting Agent" },
];

const IDS = AGENTS.map((a) => a.id) as string[];

export function isAgentId(s: string | null | undefined): s is AgentId {
  return !!s && IDS.includes(s);
}

// Null tenant = the agency Manager. Kept beside clientPath's shape on purpose:
// /admin/client/:id/agent/:agent is an ordinary client page with a sub-page.
export function agentPath(tenantId: string | null, agent: AgentId): string {
  if (tenantId === null) return `/admin/agents/${agent}`;
  return `/admin/client/${encodeURIComponent(tenantId)}/agent/${agent}`;
}
