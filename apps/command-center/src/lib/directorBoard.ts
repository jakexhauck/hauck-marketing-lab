// The per-client Director as a board (Jake, 2026-10-20): owners as rows,
// Client Fulfillment phases as columns, each task in its cell in position
// order. Owners with no tasks are left off. Pure; ClientDirector draws it.

import { ownerLabel, TASK_OWNERS, taskPhases, type ClientTask, type TaskOwner } from "./clientTasks";

export interface DirectorRow {
  owner: TaskOwner;
  label: string;
  cells: ClientTask[][];
  done: number;
  total: number;
}

export function directorBoard(tasks: ClientTask[]): { phases: { id: string; name: string }[]; rows: DirectorRow[] } {
  const phases = taskPhases();
  const col = new Map(phases.map((p, i) => [p.id, i]));
  const rows: DirectorRow[] = [];
  for (const owner of TASK_OWNERS) {
    const mine = tasks.filter((t) => t.owner === owner);
    if (!mine.length) continue;
    const cells: ClientTask[][] = phases.map(() => []);
    for (const t of mine) cells[col.get(t.phase) ?? phases.length - 1].push(t);
    for (const c of cells) c.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
    const live = mine.filter((t) => t.state !== "cut");
    rows.push({ owner, label: ownerLabel(owner), cells, done: live.filter((t) => t.state === "done").length, total: live.length });
  }
  return { phases, rows };
}

// What a text field on a task panel saves when it loses focus: Jake's edit
// since he focused it, trimmed, or null when he changed nothing. Comparing with
// the text at focus, not the server's current text, means a field Jake only
// tabbed through never writes old text over an agent's newer note or rename.
export function blurSave(local: string, atFocus: string): string | null {
  const next = local.trim();
  return next === atFocus.trim() ? null : next;
}

// One cell of the board, drawn small so all of a client's tasks fit on one
// screen (Jake, 2026-10-21): a dot per task in board order, and done out of
// the tasks not cut. The names open in the side panel.
export function cellSummary(cell: ClientTask[]): { dots: ClientTask[]; done: number; total: number } {
  const live = cell.filter((t) => t.state !== "cut");
  return { dots: cell, done: live.filter((t) => t.state === "done").length, total: live.length };
}

// How a task shows on the board (Build B, docs/build-plans/four-agents-and-handoffs.md):
// a to-do that waits on anything still open (or on a task since deleted, which
// the Director can never start it from) is "waiting"; a to-do of Jake's whose
// waits are all done or cut is a gate ready for his go.
export type TaskLook = "todo" | "waiting" | "ready-gate" | "doing" | "done" | "cut";

const over = (t: ClientTask | undefined) => !!t && (t.state === "done" || t.state === "cut");

export function taskLook(t: ClientTask, byKey: Map<string, ClientTask>): TaskLook {
  if (t.state !== "todo") return t.state;
  if (!t.waitsOn.length) return "todo";
  if (!t.waitsOn.every((k) => over(byKey.get(k)))) return "waiting";
  return t.owner === "jake" ? "ready-gate" : "todo";
}
