/**
 * Builder workspace persistence.
 *
 * Projects (registered folders) and their coding sessions are stored in
 * localStorage, including each session's transcript and the claude CLI
 * `session_id` used for `--resume`. This is deliberately separate from the
 * vault-scoped markdown chat store (`chat.rs`): Builder sessions are about
 * arbitrary code repos, not client notes, so they live in app-local state.
 */

const KEY = "hml.builder.v1";

export type BuilderMode = "plan" | "edits" | "auto";

export interface BuilderProject {
  id: string;
  name: string;
  path: string;
  /** Extra folders outside `path` to scan for docs/assets (e.g. build plans
   *  that live at the repo root). Paths come back relative to `path`. */
  docRoots?: string[];
}

export interface BuilderToolCall {
  name: string;
  detail: string;
}

export interface BuilderTurn {
  role: "user" | "agent";
  text: string;
  /** Tools the agent invoked while producing this turn (agent turns only). */
  tools?: BuilderToolCall[];
  at: string;
}

export interface BuilderSession {
  id: string;
  projectId: string;
  title: string;
  mode: BuilderMode;
  /** claude CLI session id; null until the first turn completes. */
  claudeSessionId: string | null;
  turns: BuilderTurn[];
  createdAt: string;
}

export interface BuilderData {
  projects: BuilderProject[];
  sessions: BuilderSession[];
  /** True once the default projects (mobile app + lab) have been seeded, so a
   *  deliberate deletion is not undone on the next launch. */
  seeded?: boolean;
}

/** One markdown doc or image asset inside a project (from the Rust scanner). */
export interface ResourceEntry {
  rel: string;
  name: string;
}

export interface ProjectResources {
  docs: ResourceEntry[];
  assets: ResourceEntry[];
  truncated: boolean;
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export function loadBuilderData(): BuilderData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { projects: [], sessions: [] };
    const parsed = JSON.parse(raw) as Partial<BuilderData>;
    return {
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      seeded: parsed.seeded === true,
    };
  } catch {
    return { projects: [], sessions: [] };
  }
}

export function saveBuilderData(data: BuilderData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // best-effort; localStorage may be full or unavailable
  }
}

/** Derive a friendly project name from a folder path. */
export function projectNameFromPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}

export const MODE_LABELS: Record<BuilderMode, string> = {
  plan: "Plan",
  edits: "Accept edits",
  auto: "Full auto",
};

export const MODE_HINTS: Record<BuilderMode, string> = {
  plan: "Proposes changes, writes nothing until you switch modes.",
  edits: "Edits files freely. The safe default for building.",
  auto: "Skips every prompt, including shell commands. Fastest, riskiest.",
};
