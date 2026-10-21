// The Agents section (Jake, 2026-10-17; docs/build-plans/agents.md).
//
// Four agents work inside every client, and the Manager works at the agency
// (Jake, 2026-10-20; docs/build-plans/four-agents-and-handoffs.md). This file
// is the one list of who they are, in rail order. The ids are also the values
// migration 0174 checks, and the PC runner keys its instruction files by them.
//
// The Manager is agency only: the bubble on every admin page. The Customer
// Success Manager took its place inside each client, and Creative, Landing
// Page and Reporting were folded into Ads and the CSM.

export type AgentId = "manager" | "csm" | "research" | "ads" | "ghl";

export interface AgentDef {
  id: AgentId;
  name: string;
}

export const AGENTS: AgentDef[] = [
  { id: "csm", name: "Customer Success Manager" },
  { id: "research", name: "Market Research Agent" },
  { id: "ads", name: "Ads Agent" },
  { id: "ghl", name: "GHL Agent" },
  { id: "manager", name: "Manager Agent" },
];

// The agents inside a client, in rail order.
export const CLIENT_AGENTS: AgentDef[] = AGENTS.filter((a) => a.id !== "manager");

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
