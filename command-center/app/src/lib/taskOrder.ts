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

// A move made inside a FILTERED view, applied to the whole stored order.
//
// The reorder endpoint takes the full list of ids and renumbers it, so a drag
// performed while the list is narrowed to one category has to be translated:
// the indices the row handlers produce count visible rows, and the stored order
// counts every row. Passing the first straight to the second is what used to
// write the wrong order, and is why the grip was hidden whenever a filter was
// on.
//
// The translation: the visible rows are reordered among THEMSELVES, and then
// dropped back into the exact positions in the full list that visible rows
// already occupied. Everything hidden keeps its absolute position. Dragging a
// task above another task in the "Agency" view puts it above that task, and
// moves nothing that the view is not showing, which is the only behaviour that
// can be reasoned about from a filtered screen.
//
// Under "All", visibleIds is every id and this degenerates to moveItem, so
// there is one code path rather than a filtered one and an unfiltered one.
export function moveWithinSubset<T extends { id: string }>(
  all: readonly T[],
  visibleIds: readonly string[],
  from: number,
  to: number,
): T[] {
  const wanted = new Set(visibleIds);
  // Taken from `all` rather than from visibleIds, so the subset is in stored
  // order and the indices the table produced line up with it. An id that is not
  // in the list at all is simply absent.
  const slots: number[] = [];
  const visible: T[] = [];
  all.forEach((row, index) => {
    if (!wanted.has(row.id)) return;
    slots.push(index);
    visible.push(row);
  });

  if (from === to || from < 0 || from >= visible.length) return [...all];

  const moved = moveItem(visible, from, to);
  const next = [...all];
  slots.forEach((slot, i) => {
    next[slot] = moved[i];
  });
  return next;
}
