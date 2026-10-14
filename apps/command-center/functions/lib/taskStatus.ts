// Pure task status rules for the admin_tasks endpoints.
//
// Mirror of src/lib/taskStatus.ts. The Functions build has its own tsconfig and
// does not reach into src/, so this tiny pure module is duplicated rather than
// cross-imported; both copies are unit-tested against the same cases so the
// client and the server can never drift on the completed/status coupling.

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
