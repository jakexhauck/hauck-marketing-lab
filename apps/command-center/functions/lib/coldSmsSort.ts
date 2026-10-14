// Cold SMS > Pipeline: the auto-sort rule. Pure and import-free (bar a type) so
// the server that moves cards in GHL and the board that moves them on screen
// apply the very same rule.

import type { Verdict } from "./coldSmsBoard";

// The auto-sort (Jake, 2026-10-13). Only a card sitting in Replied moves: that
// is where GHL's workflow drops a fresh reply, so a card Jake placed anywhere
// else, or one already sorted, is never pulled back out. Stages are found by
// name, so the board keeps working if Jake renames the emoji.
//
// Negatives leave the board for the Trash pipeline (Jake, 2026-10-13: Cold SMS
// lost its Negative and Unqualified columns). Positives stay on Cold SMS.

interface Pipeline {
  id: string;
  name: string;
  stages: { id: string; name: string }[];
}

export interface SortTo {
  pipelineId: string;
  stageId: string;
}

export interface SortStages {
  replied: string;
  positive: SortTo;
  // Null without a Trash pipeline: negatives then stay in Replied.
  negative: SortTo | null;
}

export interface TrashStages {
  pipelineId: string;
  negative: string;
  unqualified: string;
}

// Trash > SMS Negative Reply and SMS Unqualified. Also what the right-click
// menu offers.
export function findTrashStages(pipelines: readonly Pipeline[]): TrashStages | null {
  const trash = pipelines.find((p) => /^\s*trash\s*$/i.test(p.name));
  if (!trash) return null;
  const negative = trash.stages.find((s) => /negative/i.test(s.name))?.id;
  const unqualified = trash.stages.find((s) => /unqualified/i.test(s.name))?.id;
  return negative && unqualified ? { pipelineId: trash.id, negative, unqualified } : null;
}

export function findSortStages(board: Pipeline, pipelines: readonly Pipeline[]): SortStages | null {
  const find = (re: RegExp) => board.stages.find((s) => re.test(s.name))?.id;
  const replied = find(/replied/i);
  const positive = find(/positive/i);
  if (!replied || !positive) return null;
  const trash = findTrashStages(pipelines);
  return {
    replied,
    positive: { pipelineId: board.id, stageId: positive },
    negative: trash ? { pipelineId: trash.pipelineId, stageId: trash.negative } : null,
  };
}

const TARGET: Record<Verdict, "positive" | "negative" | null> = {
  positive: "positive",
  negative: "negative",
  stop: "negative",
  check: null,
};

export function autoSortMoves(
  cards: { id: string; stageId: string; verdict: Verdict | null }[],
  stages: SortStages,
): ({ id: string } & SortTo)[] {
  const out: ({ id: string } & SortTo)[] = [];
  for (const c of cards) {
    if (c.stageId !== stages.replied || !c.verdict) continue;
    const key = TARGET[c.verdict];
    const to = key ? stages[key] : null;
    if (to) out.push({ id: c.id, ...to });
  }
  return out;
}
