// The pure half of a drag-to-reorder: check the body, then turn the sent id
// order into sort_order numbers.
//
// Shared by the two lists that can be reordered by hand, the standalone
// Operations checklist and the task categories beside it. Both send the FULL id
// order and both renumber 0..n-1 from it; the only thing that differs is which
// table is read to decide what the caller is allowed to move, which is the half
// that has to talk to the database and therefore stays in the routes.
//
// Kept whole-order rather than "move this one up": a partial reorder has to be
// applied against a list the server re-reads, and two tabs doing that at once
// interleave into an order neither of them asked for. The sent order wins.

interface ReorderBody {
  ids?: unknown;
}

export type ReorderValidation = { ok: true; ids: string[] } | { ok: false; error: string };

export function validateReorderBody(body: ReorderBody): ReorderValidation {
  const ids = body.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "ids must be a non-empty array" };
  }
  if (!ids.every((id): id is string => typeof id === "string" && id.length > 0)) {
    return { ok: false, error: "ids must be strings" };
  }
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: "ids must be unique" };
  }
  return { ok: true, ids };
}

// Position assignment: the sent order wins, filtered to ids the caller is
// actually allowed to reorder.
export function renumber(
  ids: string[],
  allowed: ReadonlySet<string>,
): { id: string; sort_order: number }[] {
  return ids.filter((id) => allowed.has(id)).map((id, i) => ({ id, sort_order: i }));
}
