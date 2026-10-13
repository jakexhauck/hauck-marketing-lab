import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  classifyColdSmsReplies,
  getColdSmsBoard,
  getColdSmsStagePage,
  moveColdSmsCard,
  setColdSmsFollowUp,
  sweepColdSmsBooked,
  setColdSmsTag,
  type ColdSmsBoard,
  type ColdSmsCard,
  type ColdSmsVerdict,
} from "../lib/api";
import { autoSortMoves, findSortStages } from "../../functions/lib/coldSmsSort";

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

// One card to another column, totals kept right. A card already there, or not
// on screen, is left alone.
function moveInBoard(board: ColdSmsBoard, cardId: string, toStage: string): ColdSmsBoard {
  if (!board.stages) return board;
  const from = board.stages.find((s) => s.cards.some((c) => c.id === cardId));
  if (!from || from.id === toStage || !board.stages.some((s) => s.id === toStage)) return board;
  const card = from.cards.find((c) => c.id === cardId)!;
  return {
    ...board,
    stages: board.stages.map((s) => {
      if (s.id === from.id) return { ...s, cards: s.cards.filter((c) => c.id !== cardId), total: Math.max(0, s.total - 1) };
      if (s.id === toStage) return { ...s, cards: [{ ...card, stageId: toStage }, ...s.cards], total: s.total + 1 };
      return s;
    }),
  };
}

// The auto-sort on screen: the same rule the server applies in GHL
// (functions/lib/coldSmsSort.ts), run the moment a verdict is known so a card
// does not sit in Replied waiting for the round trip (Jake, 2026-10-13).
function sortOnScreen(board: ColdSmsBoard | undefined, onMove: (id: string) => void): ColdSmsBoard | undefined {
  if (!board?.stages) return board;
  const stages = findSortStages(board.stages);
  if (!stages) return board;
  let out = board;
  for (const m of autoSortMoves(board.stages.flatMap((s) => s.cards), stages)) {
    out = moveInBoard(out, m.id, m.stageId);
    onMove(m.id);
  }
  return out;
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
      // Cards are moved on screen ahead of GHL. Each server answer lists the moves
      // GHL took; a card moved here that GHL never took means the screen is
      // wrong, so only then is the board read again.
      const shown = new Set<string>();
      const taken = new Set<string>();
      const onMove = (id: string) => shown.add(id);
      qc.setQueriesData<ColdSmsBoard>({ queryKey: COLD_SMS_BOARD_KEY }, (b) => sortOnScreen(b, onMove));
      const reread = () => {
        if (cancelled) return;
        if ([...shown].some((id) => !taken.has(id))) void qc.invalidateQueries({ queryKey: COLD_SMS_BOARD_KEY });
      };
      for (let round = 0; round < 15 && !cancelled; round++) {
        let res;
        try {
          res = await classifyColdSmsReplies();
        } catch {
          if (!cancelled) setState((s) => ({ ...s, running: false, failed: true }));
          reread();
          return;
        }
        for (const m of res.moves ?? []) taken.add(m.id);
        const verdicts = new Map<string, ColdSmsVerdict>(res.classified.map((c) => [c.contactId, c.verdict]));
        qc.setQueriesData<ColdSmsBoard>({ queryKey: COLD_SMS_BOARD_KEY }, (b) => {
          let next = verdicts.size
            ? patchCards(b, (c) => (verdicts.has(c.contactId) && c.reply ? { ...c, verdict: verdicts.get(c.contactId)! } : c))
            : b;
          next = sortOnScreen(next, onMove);
          for (const m of res.moves ?? []) if (next) next = moveInBoard(next, m.id, m.stageId);
          return next;
        });
        if (!cancelled) setState({ running: res.remaining > 0, remaining: res.remaining, failed: false });
        if (res.remaining === 0 || verdicts.size === 0) break;
      }
      if (!cancelled) setState((s) => ({ ...s, running: false }));
      reread();
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

// Cards the server deleted from the Cold SMS pipeline (a booked prospect, Jake
// 2026-10-13), taken off every cached view with the column totals kept right.
export function useRemoveCards() {
  const qc = useQueryClient();
  return (ids: string[]) => {
    const gone = new Set(ids);
    qc.setQueriesData<ColdSmsBoard>({ queryKey: COLD_SMS_BOARD_KEY }, (b) => {
      if (!b?.stages) return b;
      return {
        ...b,
        stages: b.stages.map((s) => {
          const cards = s.cards.filter((c) => !gone.has(c.id));
          return { ...s, cards, total: Math.max(0, s.total - (s.cards.length - cards.length)) };
        }),
      };
    });
  };
}

// Contacted on or off for one prospect: shown on the card at once, written to
// GHL as the `contacted` tag, put back if GHL says no.
export const CONTACTED_TAG = "contacted";

export function hasContacted(tags: string[]): boolean {
  return tags.some((t) => t.trim().toLowerCase() === CONTACTED_TAG);
}

export function useContactedToggle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { contactId: string; on: boolean }) => setColdSmsTag(v.contactId, CONTACTED_TAG, v.on),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: COLD_SMS_BOARD_KEY });
      const before = qc.getQueriesData<ColdSmsBoard>({ queryKey: COLD_SMS_BOARD_KEY });
      qc.setQueriesData<ColdSmsBoard>({ queryKey: COLD_SMS_BOARD_KEY }, (b) =>
        patchCards(b, (c) => {
          if (c.contactId !== v.contactId) return c;
          const rest = c.tags.filter((t) => t.trim().toLowerCase() !== CONTACTED_TAG);
          return { ...c, tags: v.on ? [...rest, CONTACTED_TAG] : rest };
        }),
      );
      return { before };
    },
    onError: (_e, _v, ctx) => {
      for (const [key, data] of ctx?.before ?? []) qc.setQueryData(key, data);
    },
  });
}

// Follow-up day on or off for one prospect: on the card at once, saved (and a
// GHL task made) by the server, put back if the save fails.
export function useFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { card: ColdSmsCard; day: string | null }) => setColdSmsFollowUp(v.card.contactId, v.day, v.card.business),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: COLD_SMS_BOARD_KEY });
      const before = qc.getQueriesData<ColdSmsBoard>({ queryKey: COLD_SMS_BOARD_KEY });
      qc.setQueriesData<ColdSmsBoard>({ queryKey: COLD_SMS_BOARD_KEY }, (b) =>
        patchCards(b, (c) => (c.contactId === v.card.contactId ? { ...c, followUpOn: v.day } : c)),
      );
      return { before };
    },
    onError: (_e, _v, ctx) => {
      for (const [key, data] of ctx?.before ?? []) qc.setQueryData(key, data);
    },
  });
}

// Once the board is up: take booked prospects off it (their Cold SMS card is
// deleted in GHL, see sweep-booked.ts) and drop those cards from the screen.
// Rounds while the server says more are waiting, a few at most.
export function useBookedSweep(ready: boolean) {
  const removeCards = useRemoveCards();
  const started = useRef(false);
  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    void (async () => {
      for (let round = 0; round < 5; round++) {
        try {
          const res = await sweepColdSmsBooked();
          if (res.removed.length) removeCards(res.removed);
          if (res.remaining <= 0) break;
        } catch {
          break;
        }
      }
    })();
    // removeCards is rebuilt each render but only touches the query cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
}
