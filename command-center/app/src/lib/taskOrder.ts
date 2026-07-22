// Pure list mechanics for the Operations checklist's drag-to-reorder.
//
// moveItem is the optimistic array move the hook applies on drop; openFirst is
// the same "incomplete rows above completed rows" rule the GET endpoint orders
// by (completed asc), applied locally so a drop that crosses the done boundary
// settles exactly where a reload would put it.

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from === to || from < 0 || from >= next.length) return next;
  const clamped = Math.max(0, Math.min(next.length - 1, to));
  const [item] = next.splice(from, 1);
  next.splice(clamped, 0, item);
  return next;
}

// Stable partition: open rows keep their relative order, then done rows keep
// theirs. Mirrors the server's completed-first sort so the optimistic list and
// the next reload agree.
export function openFirst<T extends { completed: boolean }>(rows: readonly T[]): T[] {
  return [...rows.filter((r) => !r.completed), ...rows.filter((r) => r.completed)];
}
