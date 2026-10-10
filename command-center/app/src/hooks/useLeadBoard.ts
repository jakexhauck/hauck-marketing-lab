import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { applyMoveLocally, stageKeyOf, type BoardPayload, type MoveRequest } from "../lib/leadBoard";

// The Leads board's data. Moves are optimistic: the card lands at once, and if
// GHL refuses the move the board rolls back to what it was, so a lead never
// looks moved when it was not.

const KEY = ["pipeline-board"] as const;
const SEARCH_LAG_MS = 5000;

export function useLeadBoardQuery(enabled: boolean) {
  return useQuery({
    queryKey: KEY,
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: () => api<BoardPayload>("/api/pipeline-board"),
  });
}

function useOptimistic() {
  const qc = useQueryClient();
  return {
    qc,
    snapshot: async (apply: (prev: BoardPayload) => BoardPayload) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<BoardPayload>(KEY);
      if (prev) qc.setQueryData<BoardPayload>(KEY, apply(prev));
      return { prev };
    },
    rollback: (ctx?: { prev?: BoardPayload }) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
    },
    // GHL's opportunity search trails a stage move by ~2.5s (measured on Test
    // v2, 2026-10-08). Re-reading at once returned the OLD stage and threw the
    // card back to the column it was dragged out of. So a successful move keeps
    // the optimistic board and re-reads after the search has caught up; a
    // failed one has already rolled back and re-reads now.
    settle: (error: unknown) => {
      if (error) return qc.invalidateQueries({ queryKey: KEY });
      window.setTimeout(() => qc.invalidateQueries({ queryKey: KEY }), SEARCH_LAG_MS);
    },
  };
}

export function useMoveLead() {
  const o = useOptimistic();
  return useMutation({
    mutationFn: ({ id, ...body }: MoveRequest) =>
      api<{ ok: true; reminderCopied: boolean | null }>(`/api/pipeline-board/${encodeURIComponent(id)}/move`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onMutate: (m) =>
      o.snapshot((prev) => ({
        ...prev,
        leads: prev.leads.map((l) => (l.id === m.id ? applyMoveLocally(l, stageKeyOf(prev.stages, m.stageId), m) : l)),
      })),
    onError: (_e, _m, ctx) => o.rollback(ctx),
    onSettled: (_d: unknown, error: unknown) => o.settle(error),
  });
}

export function useNoAnswer() {
  const o = useOptimistic();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ ok: true; attempts: number; followUpAt: string }>(
        `/api/pipeline-board/${encodeURIComponent(id)}/no-answer`,
        { method: "POST" },
      ),
    onMutate: (id) =>
      o.snapshot((prev) => {
        const follow = prev.stages.find((s) => s.key === "followUp");
        if (!follow) return prev;
        const t = new Date();
        t.setDate(t.getDate() + 1);
        t.setHours(10, 0, 0, 0);
        return {
          ...prev,
          leads: prev.leads.map((l) =>
            l.id === id
              ? {
                  ...applyMoveLocally(l, "followUp", { id, stageId: follow.id, at: t.toISOString(), note: "No answer" }),
                  attempts: l.attempts + 1,
                }
              : l,
          ),
        };
      }),
    onError: (_e, _id, ctx) => o.rollback(ctx),
    onSettled: (_d: unknown, error: unknown) => o.settle(error),
  });
}
