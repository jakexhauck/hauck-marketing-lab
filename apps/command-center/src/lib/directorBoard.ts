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
