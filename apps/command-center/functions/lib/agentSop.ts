import { isAgentId } from "../../src/lib/agents";
import type { ClaimResponse } from "../../src/lib/agentWire";
import { sopForAgent } from "../../src/lib/sopPrompt";

// The agent's own SOP rides along with every claim, read off its map on the
// SOPs tab (src/lib/sopPrompt.ts). No database read, so it cannot fail the
// claim; an agent with no map answers without one.
export function withSop(claim: ClaimResponse | null): ClaimResponse | null {
  if (!claim || !isAgentId(claim.chat.agent)) return claim;
  return { ...claim, sop: sopForAgent(claim.chat.agent) };
}
