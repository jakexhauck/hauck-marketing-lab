// An agent's SOP for its prompt, read straight off its map on the SOPs tab
// (Jake, 2026-10-20; docs/build-plans/client-fulfillment-and-director.md). The
// flowchart Jake sees is the one the agent follows, so there is no second copy.
//
// The main line, in order, is the work. A "Jake approves" box closes a stage:
// the runner tells the agent to stop there and file a card. Boxes off the main
// line (side doors, handoffs) ride in the stage they branch from. Pure.

import type { AgentId } from "./agents";
import type { SopStage } from "./agentWire";
import { getAgentSop, type AgentSop, type SopNode } from "./agentSops";

type SopTask = SopStage["tasks"][number];

const REVIEW_STEP = "File a needs_ok card and wait for Jake's Approve";

function owner(n: SopNode): SopTask["owner"] {
  if (n.k === "jake" || n.k === "review") return "jake";
  if (n.k === "client") return "client";
  return "agent";
}

function task(n: SopNode, onMain: boolean): SopTask {
  let name = n.t;
  if (n.link) name = `Hand off to ${getAgentSop(n.link)?.name ?? n.link}: ${n.t}`;
  else if (n.k === "edit" && !onMain) name = `${n.t} (only when sent here)`;
  const steps = n.steps ?? n.d ?? [];
  return { name, owner: owner(n), steps: n.k === "review" ? [REVIEW_STEP, ...steps] : [...steps] };
}

// Start at the box with an outgoing main edge and none coming in, follow the
// first outgoing main edge, stop at a box already visited (a loop never hangs).
function mainLine(map: AgentSop): SopNode[] {
  const main = map.edges.filter(([, , , kind = "main"]) => kind === "main");
  const into = new Set(main.map(([, b]) => b));
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const start = main.find(([a]) => !into.has(a))?.[0] ?? main[0]?.[0] ?? map.nodes[0]?.id;
  const line: SopNode[] = [];
  const seen = new Set<string>();
  for (let id: string | undefined = start; id && !seen.has(id); id = main.find(([a]) => a === id)?.[1]) {
    seen.add(id);
    const n = byId.get(id);
    if (n) line.push(n);
  }
  return line;
}

export function mapStages(map: AgentSop): SopStage[] {
  const line = mainLine(map);
  const onMain = new Set(line.map((n) => n.id));
  const stageOf = new Map<string, number>();
  const groups: SopNode[][] = [[]];
  for (const n of line) {
    groups[groups.length - 1].push(n);
    stageOf.set(n.id, groups.length - 1);
    if (n.k === "review") groups.push([]);
  }
  if (groups.length > 1 && groups[groups.length - 1].length === 0) groups.pop();

  const stages: SopStage[] = groups.map((g) => ({
    name: g.length === 1 ? g[0].t : `${g[0].t} to ${g[g.length - 1].t}`,
    tasks: g.map((n) => task(n, true)),
    ...(map.draft ? { draft: true } : {}),
  }));

  // Off the main line: the stage of the first main box with an edge into it,
  // else the one it points to, else the last stage.
  for (const n of map.nodes) {
    if (onMain.has(n.id)) continue;
    const from = map.edges.find(([a, b]) => b === n.id && onMain.has(a))?.[0];
    const to = map.edges.find(([a, b]) => a === n.id && onMain.has(b))?.[1];
    const at = stageOf.get(from ?? to ?? "") ?? stages.length - 1;
    stages[at].tasks.push(task(n, false));
  }
  return stages;
}

// The Manager also carries the whole client journey it oversees.
export function sopForAgent(agent: AgentId): SopStage[] {
  const own = getAgentSop(agent);
  const stages = own ? mapStages(own) : [];
  if (agent !== "manager") return stages;
  const journey = getAgentSop("fulfillment");
  return journey ? [...stages, ...mapStages(journey).map((s) => ({ ...s, name: `Client Fulfillment: ${s.name}` }))] : stages;
}
