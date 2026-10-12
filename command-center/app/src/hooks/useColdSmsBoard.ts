import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  classifyColdSmsReplies,
  getColdSmsBoard,
  getColdSmsStagePage,
  moveColdSmsCard,
  type ColdSmsBoard,
  type ColdSmsCard,
  type ColdSmsVerdict,
} from "../lib/api";

// Cold SMS > Pipeline data. The board is GHL's, read live; the hook only keeps
// what the screen needs between reads: extra pages a column has loaded, and the
// verdicts Claude hands back while the board is open.

export const COLD_SMS_BOARD_KEY = ["admin", "cold-sms", "board"] as const;

// One cache entry per view: the whole board, or one day of first texts. Every
// write below patches all of them, so a verdict or a move shows in both.
export function useColdSmsBoardQuery(day: string) {
  return useQuery({
    queryKey: [...COLD_SMS_BOARD_KEY, day || "all"],
    queryFn: () => getColdSmsBoard(day || undefined),
    placeholderData: (prev) => prev,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}

function patchCards(board: ColdSmsBoard | undefined, fn: (c: ColdSmsCard) => ColdSmsCard): ColdSmsBoard | undefined {
  if (!board?.stages) return board;
  return { ...board, stages: board.stages.map((s) => ({ ...s, cards: s.cards.map(fn) })) };
}

// Ask Claude for every reply without a verdict, a batch at a time, painting each
// batch onto the cards as it lands. Stops when nothing is left, or when a round
// labels nothing (Claude down), so it never spins.
export function useReplyClassifier(ready: boolean) {
  const qc = useQueryClient();
  const [state, setState] = useState<{ running: boolean; remaining: number; failed: boolean }>({
    running: false,
    remaining: 0,
    failed: false,
  });
  const started = useRef(false);

  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    let cancelled = false;
    (async () => {
      setState({ running: true, remaining: 0, failed: false });
      for (let round = 0; round < 15 && !cancelled; round++) {
        let res;
        try {
          res = await classifyColdSmsReplies();
        } catch {
          if (!cancelled) setState((s) => ({ ...s, running: false, failed: true }));
          return;
        }
        const verdicts = new Map<string, ColdSmsVerdict>(res.classified.map((c) => [c.contactId, c.verdict]));
        if (verdicts.size) {
          qc.setQueriesData<ColdSmsBoard>({ queryKey: COLD_SMS_BOARD_KEY }, (b) =>
            patchCards(b, (c) => (verdicts.has(c.contactId) && c.reply ? { ...c, verdict: verdicts.get(c.contactId)! } : c)),
          );
        }
        if (!cancelled) setState({ running: res.remaining > 0, remaining: res.remaining, failed: false });
        if (res.remaining === 0 || verdicts.size === 0) break;
      }
      if (!cancelled) setState((s) => ({ ...s, running: false }));
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, qc]);

  return state;
}

export function useLoadMoreStage() {
  const qc = useQueryClient();
  const [loading, setLoading] = useState<string | null>(null);
  const load = async (stageId: string, cursor: string) => {
    if (loading) return;
    setLoading(stageId);
    try {
      const page = await getColdSmsStagePage(stageId, cursor);
      qc.setQueryData<ColdSmsBoard>([...COLD_SMS_BOARD_KEY, "all"], (b) => {
        if (!b?.stages) return b;
        return {
          ...b,
          stages: b.stages.map((s) => {
            if (s.id !== stageId) return s;
            const have = new Set(s.cards.map((c) => c.id));
            return { ...s, cursor: page.cursor, cards: [...s.cards, ...page.cards.filter((c) => !have.has(c.id))] };
          }),
        };
      });
    } finally {
      setLoading(null);
    }
  };
  return { load, loading };
}

// A card dragged to a column, or sent to another pipeline. Moved on screen at
// once and written to GHL; put back where it was if GHL says no.
export function useMoveCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { card: ColdSmsCard; pipelineId: string; stageId: string }) =>
      moveColdSmsCard({ opportunityId: v.card.id, pipelineId: v.pipelineId, stageId: v.stageId }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: COLD_SMS_BOARD_KEY });
      const before = qc.getQueriesData<ColdSmsBoard>({ queryKey: COLD_SMS_BOARD_KEY });
      qc.setQueriesData<ColdSmsBoard>({ queryKey: COLD_SMS_BOARD_KEY }, (b) => {
        if (!b?.stages) return b;
        const onThisBoard = b.pipeline?.id === v.pipelineId;
        return {
          ...b,
          stages: b.stages.map((s) => {
            const had = s.cards.some((c) => c.id === v.card.id);
            let cards = had ? s.cards.filter((c) => c.id !== v.card.id) : s.cards;
            let total = had ? s.total - 1 : s.total;
            if (onThisBoard && s.id === v.stageId) {
              cards = [{ ...v.card, stageId: v.stageId, movedAt: new Date().toISOString() }, ...cards];
              total += 1;
            }
            return { ...s, cards, total: Math.max(0, total) };
          }),
        };
      });
      return { before };
    },
    onError: (_e, _v, ctx) => {
      for (const [key, data] of ctx?.before ?? []) qc.setQueryData(key, data);
    },
  });
}
