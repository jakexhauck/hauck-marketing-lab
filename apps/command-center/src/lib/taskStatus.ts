// Pure task status rules for the Operations Tasks tab.
//
// admin_tasks carries both a boolean `completed` (the Done checkbox, there since
// 0012) and a three-way `status` pill (0032). The two must never disagree, so
// the coupling lives here as one pure function that the client hook and the
// endpoints both call. functions/lib/taskStatus.ts is a byte-for-byte mirror of
// these rules for the Pages Functions build (separate tsconfig, no cross-import).

export type TaskStatus = "todo" | "doing" | "done";

const STATUSES: readonly TaskStatus[] = ["todo", "doing", "done"];

// Enum guard for untrusted input (request bodies, stored rows).
export function isValidStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

export interface TaskCoupling {
  completed: boolean;
  status: TaskStatus;
}

// Resolve a partial edit against the stored pair so completed and status stay in
// sync whichever control the operator touched:
//   check Done            -> status done
//   un-check a done row   -> status drops to doing (it is back in flight)
//   status done           -> completed true
//   status off done       -> completed false
// When the caller sends both fields they win as-is; when it sends neither the
// stored pair comes back untouched.
export function deriveCoupling(
  current: TaskCoupling,
  incoming: { completed?: boolean; status?: TaskStatus },
): TaskCoupling {
  const hasCompleted = typeof incoming.completed === "boolean";
  const hasStatus = incoming.status !== undefined;

  if (hasCompleted && hasStatus) {
    return { completed: incoming.completed!, status: incoming.status! };
  }

  if (hasCompleted) {
    const completed = incoming.completed!;
    if (completed) return { completed: true, status: "done" };
    // Only a done row needs demoting; todo/doing rows keep the status they had.
    return { completed: false, status: current.status === "done" ? "doing" : current.status };
  }

  if (hasStatus) {
    const status = incoming.status!;
    return { completed: status === "done", status };
  }

  return { completed: current.completed, status: current.status };
}

// The card sub-line: "N open, N done".
export function taskCounts(tasks: { completed: boolean }[]): { open: number; done: number } {
  const done = tasks.filter((t) => t.completed).length;
  return { open: tasks.length - done, done };
}
