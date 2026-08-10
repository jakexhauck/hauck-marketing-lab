// The question list as a tree, without ever storing one (0099).
//
// A form is a FLAT ordered list of questions, each optionally carrying a rule
// naming an earlier answer. Meta's builder draws that as a tree: a conditional
// question owns the follow-ups its answers reveal. Both views are needed, and
// only the flat one is stored, because a stored tree cannot be reordered or
// re-pointed without rewriting itself.
//
// So this module is the bridge. It puts the flat list into tree order, works out
// what belongs to what, and moves a question WITH everything hanging off it.
// Moving a parent above the answer that reveals it would silently drop the rule
// on save, which is the one thing an editor must never do quietly.

import type { LeadQuestion } from "../../functions/lib/adLeadForms";

// The rule, only when it actually points at a question and an answer that
// exist. Anything else is a top-level question with a rule the cleaner will
// drop, and it must still be visible and editable in the meantime.
function parentOf(q: LeadQuestion, byId: Map<string, LeadQuestion>): LeadQuestion | null {
  if (!q.showIf) return null;
  const parent = byId.get(q.showIf.questionId);
  if (!parent) return null;
  return parent.options.some((o) => o.label === q.showIf!.optionLabel) ? parent : null;
}

export function indexById(questions: LeadQuestion[]): Map<string, LeadQuestion> {
  return new Map(questions.map((q) => [q.id, q]));
}

export function isFollowUp(q: LeadQuestion, questions: LeadQuestion[]): boolean {
  return parentOf(q, indexById(questions)) !== null;
}

export function topLevel(questions: LeadQuestion[]): LeadQuestion[] {
  const byId = indexById(questions);
  return questions.filter((q) => parentOf(q, byId) === null);
}

// The questions one answer reveals, in list order.
export function childrenOf(
  questions: LeadQuestion[],
  parentId: string,
  optionLabel: string,
): LeadQuestion[] {
  return questions.filter(
    (q) => q.showIf && q.showIf.questionId === parentId && q.showIf.optionLabel === optionLabel,
  );
}

// A question and everything that hangs off it, transitively.
export function subtreeIds(questions: LeadQuestion[], rootId: string): string[] {
  const out: string[] = [rootId];
  // Breadth-first over the ids already collected, so a follow-up of a follow-up
  // comes along too. Guarded by the seen set: a hand-edited row could point a
  // rule in a circle, and this must terminate on one.
  const seen = new Set(out);
  for (let i = 0; i < out.length; i += 1) {
    const id = out[i];
    for (const q of questions) {
      if (q.showIf?.questionId === id && !seen.has(q.id)) {
        seen.add(q.id);
        out.push(q.id);
      }
    }
  }
  return out;
}

// The flat list, reordered so every question sits immediately after the answer
// that reveals it. Every subtree becomes contiguous, which is what makes moving
// one a single splice, and it is the order the cleaner wants anyway: a rule may
// only point backwards.
export function treeOrder(questions: LeadQuestion[]): LeadQuestion[] {
  const byId = indexById(questions);
  const out: LeadQuestion[] = [];
  const placed = new Set<string>();

  const walk = (q: LeadQuestion) => {
    if (placed.has(q.id)) return;
    placed.add(q.id);
    out.push(q);
    for (const option of q.options) {
      for (const child of childrenOf(questions, q.id, option.label)) walk(child);
    }
  };

  for (const q of questions) {
    if (parentOf(q, byId) === null) walk(q);
  }
  // A question whose rule points in a circle is placed by nobody above. It is
  // kept, at the end, rather than deleted by a reorder.
  for (const q of questions) if (!placed.has(q.id)) out.push(q);

  return out;
}

// The questions a given question sits among: its siblings under the same
// answer, or the top level.
function siblingsOf(questions: LeadQuestion[], q: LeadQuestion): LeadQuestion[] {
  const parent = parentOf(q, indexById(questions));
  if (!parent || !q.showIf) return topLevel(questions);
  return childrenOf(questions, parent.id, q.showIf.optionLabel);
}

// Move a question one place among its siblings, taking its follow-ups with it.
// Returns the list unchanged when there is nowhere to go.
export function moveQuestion(
  questions: LeadQuestion[],
  id: string,
  by: -1 | 1,
): LeadQuestion[] {
  const ordered = treeOrder(questions);
  const self = ordered.find((q) => q.id === id);
  if (!self) return questions;

  const siblings = siblingsOf(ordered, self);
  const at = siblings.findIndex((q) => q.id === id);
  const swapWith = siblings[at + by];
  if (at < 0 || !swapWith) return questions;

  const mine = new Set(subtreeIds(ordered, id));
  const theirs = new Set(subtreeIds(ordered, swapWith.id));

  // Both subtrees are contiguous in tree order, so this is a swap of two blocks
  // rather than an index shuffle: pull each out, then put them back in the
  // other's place.
  const mineBlock = ordered.filter((q) => mine.has(q.id));
  const theirsBlock = ordered.filter((q) => theirs.has(q.id));
  const firstOf = (block: LeadQuestion[]) => ordered.indexOf(block[0]);

  const [aBlock, bBlock] =
    firstOf(mineBlock) < firstOf(theirsBlock) ? [mineBlock, theirsBlock] : [theirsBlock, mineBlock];

  const out: LeadQuestion[] = [];
  let swapped = false;
  for (const q of ordered) {
    if (mine.has(q.id) || theirs.has(q.id)) {
      if (!swapped) {
        out.push(...bBlock, ...aBlock);
        swapped = true;
      }
      continue;
    }
    out.push(q);
  }
  return out;
}

// Remove a question and everything that hangs off it. A follow-up whose parent
// is gone can never be asked, so leaving it behind would leave a question on the
// page that the preview refuses to show and the paste refuses to print.
export function removeSubtree(questions: LeadQuestion[], id: string): LeadQuestion[] {
  const gone = new Set(subtreeIds(questions, id));
  return questions.filter((q) => !gone.has(q.id));
}

// Insert a follow-up directly after the last question its answer already
// reveals, or after the parent when the answer has none yet. Position is the
// whole contract: a rule may only point backwards, so a follow-up placed above
// its parent would be dropped on save.
export function insertFollowUp(
  questions: LeadQuestion[],
  parentId: string,
  optionLabel: string,
  question: LeadQuestion,
): LeadQuestion[] {
  const ordered = treeOrder(questions);
  const existing = childrenOf(ordered, parentId, optionLabel);
  const anchor = existing.length ? existing[existing.length - 1] : ordered.find((q) => q.id === parentId);
  if (!anchor) return [...ordered, question];

  // After the anchor AND after everything hanging off it, so a follow-up does
  // not land in the middle of a sibling's subtree.
  const block = new Set(subtreeIds(ordered, anchor.id));
  let last = 0;
  ordered.forEach((q, i) => {
    if (block.has(q.id)) last = i;
  });

  const out = [...ordered];
  out.splice(last + 1, 0, question);
  return out;
}

// An id no question in the list holds, and none will after a reorder.
export function nextQuestionId(questions: LeadQuestion[]): string {
  const taken = new Set(questions.map((q) => q.id));
  let n = questions.length + 1;
  while (taken.has(`q${n}`)) n += 1;
  return `q${n}`;
}
