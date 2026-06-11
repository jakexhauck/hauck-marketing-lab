/**
 * Project plan graph: the data layer behind the Builder overhaul.
 *
 * A project is planned as one conversation, decomposed into ordered *steps*,
 * and then driven from a node graph: a central orb (the master plan) with a box
 * per step, dependency arrows between them, and a Claude build session behind
 * each box. The plan lives entirely inside the project repo so it git-syncs and
 * opens cleanly in any editor:
 *
 *   <project>/.hml/plan.json          — the manifest (steps, deps, status, ids)
 *   <project>/.hml/plan/<id>.md       — one markdown spec per step
 *   <project>/.hml/master.md          — the full master plan (the orb)
 *
 * Persistence rides on the two scoped file-IO commands (read/writeProjectText);
 * there is no database. Decomposition is a single Claude turn that returns JSON,
 * which this module parses, validates, and files.
 */
import { api } from "./tauri";

export const PLAN_DIR = ".hml";
export const MANIFEST_REL = `${PLAN_DIR}/plan.json`;
export const MASTER_REL = `${PLAN_DIR}/master.md`;
export const STEPS_DIR = `${PLAN_DIR}/plan`;

export type StepStatus = "pending" | "building" | "done";

export interface PlanStep {
  /** Stable slug id, e.g. "01-db-migration". Doubles as the md filename stem. */
  id: string;
  title: string;
  /** One-line summary shown on the box. */
  summary: string;
  /** Project-relative path of the markdown spec, e.g. ".hml/plan/01-foo.md". */
  file: string;
  /** Ids of steps that must reach "done" before this one unlocks. */
  deps: string[];
  status: StepStatus;
  /** claude CLI session id for this step's build chat; null until first turn. */
  claudeSessionId: string | null;
}

export interface ProjectGraph {
  version: 1;
  title: string;
  /** One-paragraph summary of the whole project (shown on the orb hover). */
  summary: string;
  steps: PlanStep[];
  createdAt: string;
  updatedAt: string;
}

// ─── Manifest IO ────────────────────────────────────────────────────────────

/** Load a project's plan graph, or null when the project has not been planned. */
export async function loadGraph(projectPath: string): Promise<ProjectGraph | null> {
  let raw: string | null;
  try {
    raw = await api.readProjectText(projectPath, MANIFEST_REL);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ProjectGraph;
    if (!Array.isArray(parsed.steps)) return null;
    // Defensive coercion: never trust a hand-edited manifest blindly.
    parsed.steps = parsed.steps.map(coerceStep);
    return parsed;
  } catch {
    return null;
  }
}

function coerceStep(s: Partial<PlanStep>): PlanStep {
  const status: StepStatus =
    s.status === "building" || s.status === "done" ? s.status : "pending";
  return {
    id: String(s.id ?? "").trim() || "step",
    title: String(s.title ?? "").trim() || "Untitled step",
    summary: String(s.summary ?? "").trim(),
    file: String(s.file ?? "").trim(),
    deps: Array.isArray(s.deps) ? s.deps.map(String) : [],
    status,
    claudeSessionId: typeof s.claudeSessionId === "string" ? s.claudeSessionId : null,
  };
}

/** Persist the manifest, stamping updatedAt. */
export async function saveGraph(
  projectPath: string,
  graph: ProjectGraph,
): Promise<ProjectGraph> {
  const next: ProjectGraph = { ...graph, updatedAt: new Date().toISOString() };
  await api.writeProjectText(projectPath, MANIFEST_REL, JSON.stringify(next, null, 2));
  return next;
}

/** Read one step's markdown spec from disk. */
export async function readStepSpec(
  projectPath: string,
  step: PlanStep,
): Promise<string> {
  try {
    return (await api.readProjectText(projectPath, step.file)) ?? "";
  } catch {
    return "";
  }
}

// ─── DAG helpers ─────────────────────────────────────────────────────────────

/** A step unlocks once every dependency is done. Steps with no deps are open. */
export function isUnlocked(step: PlanStep, byId: Map<string, PlanStep>): boolean {
  return step.deps.every((d) => byId.get(d)?.status === "done");
}

export function stepsById(graph: ProjectGraph): Map<string, PlanStep> {
  return new Map(graph.steps.map((s) => [s.id, s]));
}

/** True while any step is mid-build; used to enforce one-build-at-a-time. */
export function anyBuilding(graph: ProjectGraph): boolean {
  return graph.steps.some((s) => s.status === "building");
}

export interface GraphProgress {
  done: number;
  total: number;
  /** 0..1 */
  ratio: number;
}

export function graphProgress(graph: ProjectGraph): GraphProgress {
  const total = graph.steps.length;
  const done = graph.steps.filter((s) => s.status === "done").length;
  return { done, total, ratio: total === 0 ? 0 : done / total };
}

export interface NodePos {
  id: string;
  x: number;
  y: number;
}

/**
 * Radial layout: the orb sits at the centre, steps fan out around it on a ring.
 * Pure geometry (no dependency-aware layout yet), which keeps the "orb with
 * lines radiating to boxes" look the user asked for; dependency arrows are
 * drawn box-to-box on top of this ring.
 */
export function radialLayout(
  graph: ProjectGraph,
  cx: number,
  cy: number,
  radius: number,
): { center: NodePos; nodes: NodePos[] } {
  const n = graph.steps.length;
  const nodes = graph.steps.map((s, i) => {
    // Start at the top and go clockwise; -90deg offset puts step 1 up top.
    const angle = (-Math.PI / 2) + (2 * Math.PI * i) / Math.max(n, 1);
    return {
      id: s.id,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });
  return { center: { id: "__orb__", x: cx, y: cy }, nodes };
}

// ─── Step id helpers ─────────────────────────────────────────────────────────

export function slugifyStep(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "step"
  );
}

/** Build a unique, zero-padded, ordered step id from a title and its index. */
export function makeStepId(index: number, title: string): string {
  const num = String(index + 1).padStart(2, "0");
  return `${num}-${slugifyStep(title)}`;
}

// ─── Prompts ─────────────────────────────────────────────────────────────────

const NO_DASH =
  "Never use em dashes. Use commas, periods, parentheses, or colons instead.";

/**
 * System framing for the planning conversation. Runs as a Builder session in
 * `plan` mode, so Claude can read the real repo but writes nothing yet.
 */
export function planningSystemPrompt(projectName: string): string {
  return [
    `You are the planning partner for the "${projectName}" project, working inside its real repository.`,
    "Your job in this conversation is to design a concrete, buildable plan WITH the user, not to write code yet.",
    "Read the relevant files to ground yourself. Challenge weak ideas. Ask sharp questions when something is ambiguous.",
    "Think in discrete, independently-buildable steps that each map to one markdown spec and one focused build session.",
    "When the user is satisfied, they will click Generate graph; you do not need to output JSON during the conversation.",
    "Address the user as Sir. Calm, precise, dry. No fluff.",
    NO_DASH,
  ].join("\n");
}

/**
 * The decomposition turn. Asks the planning session to emit the full step set as
 * JSON inside a fenced block. Sent as the next message in the same session, so
 * Claude already holds the agreed plan in context.
 */
export function decompositionPrompt(): string {
  return [
    "We are done planning. Decompose everything we agreed into an ordered set of build steps.",
    "Return ONLY a single fenced ```json code block, no prose before or after, matching exactly this shape:",
    "",
    "```json",
    "{",
    '  "title": "<short project title>",',
    '  "summary": "<one paragraph describing the whole project>",',
    '  "steps": [',
    "    {",
    '      "title": "<short imperative step title>",',
    '      "summary": "<one line: what this step delivers>",',
    '      "deps": [<indexes of earlier steps this depends on, 0-based, or empty>],',
    '      "spec": "<a full markdown build spec for ONLY this step: goal, files likely touched, approach, acceptance criteria>"',
    "    }",
    "  ]",
    "}",
    "```",
    "",
    "Rules:",
    "- Order steps so dependencies come first. Use the deps array to record real ordering constraints only (not every prior step).",
    "- 3 to 12 steps. Each step must be independently buildable in one focused session.",
    '- "deps" holds 0-based indexes into this same steps array.',
    "- The spec is markdown and may be long. It is the only context that step's build session gets, so make it self-contained.",
    NO_DASH,
  ].join("\n");
}

export interface DecomposedStep {
  title: string;
  summary: string;
  deps: number[];
  spec: string;
}

export interface Decomposition {
  title: string;
  summary: string;
  steps: DecomposedStep[];
}

/** Pull the JSON decomposition out of a Claude reply (fenced block or bare). */
export function parseDecomposition(reply: string): Decomposition | null {
  const fence = reply.match(/```json\s*([\s\S]*?)```/i) ?? reply.match(/```\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : reply;
  let obj: unknown;
  try {
    obj = JSON.parse(candidate.trim());
  } catch {
    // Last resort: grab the outermost { ... } span.
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      obj = JSON.parse(candidate.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  if (typeof obj !== "object" || obj === null) return null;
  const o = obj as Record<string, unknown>;
  const rawSteps = Array.isArray(o.steps) ? o.steps : [];
  const steps: DecomposedStep[] = rawSteps.map((s) => {
    const r = (s ?? {}) as Record<string, unknown>;
    return {
      title: String(r.title ?? "").trim() || "Untitled step",
      summary: String(r.summary ?? "").trim(),
      deps: Array.isArray(r.deps)
        ? r.deps.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0)
        : [],
      spec: String(r.spec ?? "").trim(),
    };
  });
  if (steps.length === 0) return null;
  return {
    title: String(o.title ?? "").trim() || "Untitled project",
    summary: String(o.summary ?? "").trim(),
    steps,
  };
}

/**
 * Turn a parsed decomposition into a graph, writing the master plan and each
 * step's markdown spec to `.hml/`, then persisting the manifest. Returns the
 * saved graph.
 */
export async function materializeGraph(
  projectPath: string,
  masterPlanMarkdown: string,
  decomp: Decomposition,
): Promise<ProjectGraph> {
  const now = new Date().toISOString();
  // First pass: stable ids so deps (indexes) can be remapped to ids.
  const ids = decomp.steps.map((s, i) => makeStepId(i, s.title));
  const steps: PlanStep[] = decomp.steps.map((s, i) => ({
    id: ids[i],
    title: s.title,
    summary: s.summary,
    file: `${STEPS_DIR}/${ids[i]}.md`,
    deps: s.deps.filter((d) => d < ids.length && d !== i).map((d) => ids[d]),
    status: "pending",
    claudeSessionId: null,
  }));

  // Write the master plan and every step spec.
  await api.writeProjectText(projectPath, MASTER_REL, masterPlanMarkdown);
  await Promise.all(
    decomp.steps.map((s, i) => {
      const body = stepSpecFile(steps[i], s.spec);
      return api.writeProjectText(projectPath, steps[i].file, body);
    }),
  );

  const graph: ProjectGraph = {
    version: 1,
    title: decomp.title,
    summary: decomp.summary,
    steps,
    createdAt: now,
    updatedAt: now,
  };
  return saveGraph(projectPath, graph);
}

/** Assemble the master plan markdown (the orb) from a decomposition. */
export function buildMasterMarkdown(decomp: Decomposition): string {
  const lines = [`# ${decomp.title}`, "", decomp.summary, "", "## Steps", ""];
  decomp.steps.forEach((s, i) => {
    const deps =
      s.deps.length > 0
        ? ` _(after ${s.deps.map((d) => `#${d + 1}`).join(", ")})_`
        : "";
    lines.push(`${i + 1}. **${s.title}**${deps}: ${s.summary}`);
  });
  lines.push("");
  return lines.join("\n");
}

/** Compose a step's on-disk markdown: a small header plus Claude's spec body. */
function stepSpecFile(step: PlanStep, spec: string): string {
  const depsLine =
    step.deps.length > 0 ? `> Depends on: ${step.deps.join(", ")}\n` : "";
  return `# ${step.title}\n\n> ${step.summary}\n${depsLine}\n${spec}\n`;
}

/** The opening message handed to a step's build session. */
export function buildSessionSeed(step: PlanStep, spec: string): string {
  return [
    `You are building one step of a larger project: **${step.title}**.`,
    "Implement it in this repository. The full spec for this step follows. Stay within its scope; other steps cover the rest.",
    "",
    "---",
    spec,
    "---",
    "",
    "Begin. Read whatever you need first, then make the changes.",
    NO_DASH,
  ].join("\n");
}
