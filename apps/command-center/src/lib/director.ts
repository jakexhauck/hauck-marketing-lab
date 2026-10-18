// The Director (Jake, 2026-10-18; docs/build-plans/director.md).
//
// One SOP per agent, in two halves. The Director page holds the WHAT: stages
// (Jake approves between them) and the tasks in each, with who owns them. The
// SOPs graph holds the HOW: a task linked to a graph box (nodeId) takes its
// steps from that box in lib/agentSops.ts; a task Jake added on the Director
// carries its own steps (how), drafted by Claude and held as "draft" until he
// approves them on the SOPs page.
//
// Pure: the page, the server and the runner's claim all read these.

import { AGENT_SOPS, type NodeKind, type SopNode } from "./agentSops";
import type { AgentId } from "./agents";

export type SopOwner = "agent" | "jake" | "client";
export type HowStatus = "set" | "draft";

export interface DirectorStage {
  id: string;
  agent: AgentId;
  position: number;
  name: string;
}

export interface DirectorTask {
  id: string;
  agent: AgentId;
  stageId: string;
  position: number;
  name: string;
  owner: SopOwner;
  nodeId: string | null;
  how: string | null;
  howStatus: HowStatus;
  removed: boolean;
}

export interface DirectorResponse {
  stages: DirectorStage[];
  tasks: DirectorTask[];
}

export const OWNERS: SopOwner[] = ["agent", "jake", "client"];

export function isSopOwner(v: unknown): v is SopOwner {
  return typeof v === "string" && (OWNERS as string[]).includes(v);
}

// "GHL Agent", "Jake", "Client". The agent's own name, since a board belongs to
// one agent.
export function ownerLabel(owner: SopOwner, agentName: string): string {
  return owner === "agent" ? `${agentName} Agent` : owner === "jake" ? "Jake" : "Client";
}

// The graph fill for a box Jake added on the Director.
export function ownerKind(owner: SopOwner): NodeKind {
  return owner === "agent" ? "agent" : owner === "jake" ? "jake" : "client";
}

export const NAME_MAX = 120;
export const STAGE_NAME_MAX = 80;
export const HOW_MAX = 4000;

export function cleanName(v: unknown, max = NAME_MAX): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s && s.length <= max ? s : null;
}

// Steps written one per line, numbered or not. Numbers come off, blanks go.
export function howLines(how: string | null | undefined): string[] {
  return (how ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim())
    .filter(Boolean);
}

export function stepsToHow(steps: string[]): string {
  return steps.map((s, i) => `${i + 1}. ${s.trim()}`).join("\n");
}

export function graphNode(agent: AgentId, nodeId: string | null): SopNode | null {
  if (!nodeId) return null;
  return AGENT_SOPS.find((m) => m.id === agent)?.nodes.find((n) => n.id === nodeId) ?? null;
}

// What the agent is told to do for one task: the graph box's steps, or the
// approved steps Jake's added task carries. A draft has none yet.
export function taskSteps(task: DirectorTask): string[] {
  const node = graphNode(task.agent, task.nodeId);
  if (node) return node.steps ?? node.d ?? [];
  return task.howStatus === "set" ? howLines(task.how) : [];
}

export interface Column {
  stage: DirectorStage;
  tasks: DirectorTask[];
}

// One agent's board, stages left to right, tasks top to bottom. Removed tasks
// are left out; the graph asks for them separately.
export function boardFor(agent: AgentId, data: DirectorResponse | undefined): Column[] {
  if (!data) return [];
  const byPos = <T extends { position: number }>(a: T, b: T) => a.position - b.position;
  return data.stages
    .filter((s) => s.agent === agent)
    .sort(byPos)
    .map((stage) => ({
      stage,
      tasks: data.tasks.filter((t) => t.stageId === stage.id && !t.removed).sort(byPos),
    }));
}

export interface PromptSopTask {
  name: string;
  owner: SopOwner;
  steps: string[];
}

export interface PromptSopStage {
  name: string;
  tasks: PromptSopTask[];
}

// The agent's SOP for its prompt. A draft task is left out until Jake approves
// its steps, so an agent never works from text nobody signed off.
export function agentSopForPrompt(agent: AgentId, data: DirectorResponse): PromptSopStage[] {
  return boardFor(agent, data)
    .map(({ stage, tasks }) => ({
      name: stage.name,
      tasks: tasks
        .filter((t) => t.nodeId || t.howStatus === "set")
        .map((t) => ({ name: t.name, owner: t.owner, steps: taskSteps(t) })),
    }))
    .filter((s) => s.tasks.length > 0);
}

// Where a task lands when it moves: the list for the target stage with the
// task at `index`, the rest keeping their order. Returns the ids in order.
export function moveOrder(stageTaskIds: string[], taskId: string, index: number): string[] {
  const rest = stageTaskIds.filter((id) => id !== taskId);
  const at = Math.max(0, Math.min(index, rest.length));
  return [...rest.slice(0, at), taskId, ...rest.slice(at)];
}

// Claude's answer to the Tell bar: which stage, the task, and its steps.
export interface TellSuggestion {
  stage: number;
  name: string;
  owner: SopOwner;
  steps: string[];
}

export function isTellSuggestion(v: unknown): v is TellSuggestion {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.stage === "number" &&
    Number.isInteger(o.stage) &&
    o.stage >= 0 &&
    typeof o.name === "string" &&
    o.name.trim().length > 0 &&
    isSopOwner(o.owner) &&
    Array.isArray(o.steps) &&
    o.steps.length > 0 &&
    o.steps.every((s) => typeof s === "string" && s.trim().length > 0)
  );
}

export interface DraftSteps {
  steps: string[];
}

export function isDraftSteps(v: unknown): v is DraftSteps {
  if (!v || typeof v !== "object") return false;
  const s = (v as Record<string, unknown>).steps;
  return Array.isArray(s) && s.length > 0 && s.every((x) => typeof x === "string" && x.trim().length > 0);
}
