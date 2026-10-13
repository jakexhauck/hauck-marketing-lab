// Cold SMS > Pipeline: the auto-sort rule. Pure and import-free (bar a type) so
// the server that moves cards in GHL and the board that moves them on screen
// apply the very same rule.

import type { Verdict } from "./coldSmsBoard";

// The auto-sort (Jake, 2026-10-13). Only a card sitting in Replied moves: that
// is where GHL's workflow drops a fresh reply, so a card Jake placed anywhere
// else, or one already sorted, is never pulled back out. Stages are found by
// name, so the board keeps working if Jake renames the emoji.

export interface SortStages {
  replied: string;
  positive: string;
  negative: string;
}

export function findSortStages(stages: { id: string; name: string }[]): SortStages | null {
  const find = (re: RegExp) => stages.find((s) => re.test(s.name))?.id;
  const replied = find(/replied/i);
  const positive = find(/positive/i);
  // Jake folded negatives into "Not Responded/Negative Reply" (2026-10-13); a
  // stage named for both wins over a plain "Negative Reply" still on the board.
  const negative = find(/not responded.*negative|negative.*not responded/i) ?? find(/negative/i);
  return replied && positive && negative ? { replied, positive, negative } : null;
}

const TARGET: Record<Verdict, keyof SortStages | null> = {
  positive: "positive",
  negative: "negative",
  stop: "negative",
  check: null,
};

export function autoSortMoves(
  cards: { id: string; stageId: string; verdict: Verdict | null }[],
  stages: SortStages,
): { id: string; stageId: string }[] {
  const out: { id: string; stageId: string }[] = [];
  for (const c of cards) {
    if (c.stageId !== stages.replied || !c.verdict) continue;
    const to = TARGET[c.verdict];
    if (to) out.push({ id: c.id, stageId: stages[to] });
  }
  return out;
}
