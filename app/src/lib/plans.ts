/**
 * Build-plan storage layer.
 *
 * Plans live as markdown notes under `vault/Plans/<folder>/<name>.md`, so they
 * git-sync across machines and open cleanly in Obsidian. There is no separate
 * database and no new Rust command: everything is built on the existing vault
 * note primitives (writeVaultNote creates parent dirs, listVaultNotes walks the
 * tree, vaultRootPath gives the absolute root, read/deleteVaultNote do the rest).
 *
 * The chat surface (PlansPage) produces the plan body; this module just files,
 * lists, moves, and deletes it.
 */
import { api } from "./tauri";
import type { NoteFront, VaultNote } from "./types";

export type PlanKind = "feature" | "business" | "idea";
export type PlanStatus = "parked" | "draft" | "ready";

export const PLANS_ROOT = "Plans";

export interface PlanSummary {
  /** Absolute path on disk. */
  path: string;
  /** Vault-relative path, e.g. "Plans/Marketing/win-back.md". */
  relPath: string;
  /** Folder path under Plans/, "" when the plan sits at the Plans root. */
  folder: string;
  /** Filename without the .md extension. */
  name: string;
  title: string;
  status: PlanStatus;
  kind: PlanKind;
  /** ISO timestamp, "" when the note predates the field. */
  created: string;
  body: string;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function coerceStatus(v: unknown): PlanStatus {
  return v === "parked" || v === "draft" || v === "ready" ? v : "draft";
}

function coerceKind(v: unknown): PlanKind {
  return v === "feature" || v === "business" || v === "idea" ? v : "idea";
}

/** Pull the first markdown heading or first non-empty line as a fallback title. */
export function titleFromBody(body: string): string {
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    return (heading ? heading[1] : line).trim().slice(0, 120);
  }
  return "Untitled plan";
}

/** Filesystem-safe segment for a folder or filename (no extension). */
export function sanitizeSegment(s: string): string {
  const cleaned = s
    .trim()
    .replace(/[^A-Za-z0-9 _-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned : "untitled";
}

function summaryFromNote(note: VaultNote): PlanSummary {
  const rel = note.rel_path.replace(/\\/g, "/");
  const afterRoot = rel.slice(PLANS_ROOT.length + 1); // drop "Plans/"
  const lastSlash = afterRoot.lastIndexOf("/");
  const folder = lastSlash === -1 ? "" : afterRoot.slice(0, lastSlash);
  const file = lastSlash === -1 ? afterRoot : afterRoot.slice(lastSlash + 1);
  const name = file.replace(/\.md$/i, "");
  const front = note.front ?? {};
  const title = asString(front.title).trim() || titleFromBody(note.body) || name;
  return {
    path: note.path,
    relPath: rel,
    folder,
    name,
    title,
    status: coerceStatus(front.status),
    kind: coerceKind((front as Record<string, unknown>).plan_kind),
    created: asString((front as Record<string, unknown>).created),
    body: note.body,
  };
}

/** List every plan under vault/Plans, newest first. */
export async function listPlans(root: string): Promise<PlanSummary[]> {
  const notes = await api.listVaultNotes(root);
  const plans = notes
    .filter((n) => {
      const rel = n.rel_path.replace(/\\/g, "/");
      return rel.startsWith(`${PLANS_ROOT}/`) && rel.toLowerCase().endsWith(".md");
    })
    .map(summaryFromNote);
  plans.sort((a, b) => (b.created || "").localeCompare(a.created || ""));
  return plans;
}

/** Distinct folder paths that currently hold at least one plan, sorted. */
export function planFolders(plans: PlanSummary[]): string[] {
  const set = new Set<string>();
  for (const p of plans) if (p.folder) set.add(p.folder);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function buildPath(vaultRoot: string, folder: string, name: string): string {
  const segs = [vaultRoot.replace(/\/$/, ""), PLANS_ROOT];
  if (folder) {
    for (const seg of folder.split("/")) {
      const clean = sanitizeSegment(seg);
      if (clean) segs.push(clean);
    }
  }
  segs.push(`${sanitizeSegment(name)}.md`);
  return segs.join("/");
}

export interface SavePlanInput {
  folder: string;
  name: string;
  title: string;
  kind: PlanKind;
  status: PlanStatus;
  body: string;
  created?: string;
}

/**
 * Write a plan to vault/Plans/<folder>/<name>.md. Stamps `created` when not
 * supplied. Returns the freshly-listed summary.
 */
export async function savePlan(root: string, input: SavePlanInput): Promise<PlanSummary> {
  const vaultRoot = await api.vaultRootPath(root);
  const path = buildPath(vaultRoot, input.folder, input.name);
  const created = input.created || new Date().toISOString();
  const front: NoteFront = {
    type: "plan",
    title: input.title.trim() || titleFromBody(input.body),
    status: input.status,
    tags: ["plan", input.kind],
    plan_kind: input.kind,
    created,
  };
  const note = await api.writeVaultNote(root, path, front, input.body);
  return summaryFromNote(note);
}

/** Park a raw idea as a stub plan, no chat required. */
export async function parkIdea(
  root: string,
  folder: string,
  rawText: string,
): Promise<PlanSummary> {
  const text = rawText.trim();
  const title = titleFromBody(text);
  return savePlan(root, {
    folder,
    name: title,
    title,
    kind: "idea",
    status: "parked",
    body: text,
  });
}

export async function deletePlan(root: string, path: string): Promise<void> {
  await api.deleteVaultNote(root, path);
}

/** Move a plan to a different folder by rewriting it at the new path. */
export async function movePlan(
  root: string,
  plan: PlanSummary,
  newFolder: string,
): Promise<PlanSummary> {
  if (newFolder === plan.folder) return plan;
  const moved = await savePlan(root, {
    folder: newFolder,
    name: plan.name,
    title: plan.title,
    kind: plan.kind,
    status: plan.status,
    body: plan.body,
    created: plan.created,
  });
  // Delete the old file only after the new one is safely written.
  if (moved.path !== plan.path) {
    await api.deleteVaultNote(root, plan.path);
  }
  return moved;
}

export const PLANS_CHANGED_EVENT = "plans://changed";

/** Notify any listeners (e.g. the sidebar badge) that the plan set changed. */
export function notifyPlansChanged(): void {
  window.dispatchEvent(new Event(PLANS_CHANGED_EVENT));
}
