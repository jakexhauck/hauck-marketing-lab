import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSalesPlaybookCategory,
  createSalesPlaybookItem,
  deleteSalesPlaybookCategory,
  deleteSalesPlaybookItem,
  getSalesPlaybook,
  updateSalesPlaybookCategory,
  updateSalesPlaybookItem,
} from "../lib/api";

// Sales > Playbook (0074): the prompts On Call draws in its three columns.
//
// One query serves both pages, because they are the same list asked two
// different questions. The management page asks for retired prompts too; On
// Call never does, so a prompt Jake pulls this morning is off the call by the
// next read rather than lingering until a deploy.

const KEY = ["admin", "sales", "playbook"] as const;

export function useSalesPlaybookQuery(includeArchived = false) {
  return useQuery({
    queryKey: [...KEY, includeArchived ? "all" : "live"],
    // Long-ish: a playbook changes on the days Jake sits down to change it, not
    // while a call is running. Anything he edits invalidates this immediately
    // anyway, so the timer only matters for a second tab.
    staleTime: 5 * 60_000,
    queryFn: () => getSalesPlaybook(includeArchived),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  // Both variants, live and all: an archive toggle moves a row between them and
  // refreshing only the one that was open leaves the other quietly wrong.
  return () => {
    void qc.invalidateQueries({ queryKey: KEY });
  };
}

export function useCreatePlaybookItem() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: createSalesPlaybookItem, onSuccess: invalidate });
}

export function useUpdatePlaybookItem() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: updateSalesPlaybookItem, onSuccess: invalidate });
}

export function useDeletePlaybookItem() {
  const invalidate = useInvalidate();
  return useMutation({
    // Not retried: a delete that actually succeeded and reported a network
    // failure would, on a second attempt, report "not found" and look like a
    // different bug.
    retry: false,
    mutationFn: deleteSalesPlaybookItem,
    onSuccess: invalidate,
  });
}

// The headings inside a column (0075). Same cache key: they arrive on the same
// read as the prompts, so they go stale together.

export function useCreatePlaybookCategory() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: createSalesPlaybookCategory, onSuccess: invalidate });
}

export function useUpdatePlaybookCategory() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: updateSalesPlaybookCategory, onSuccess: invalidate });
}

export function useDeletePlaybookCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    // Not retried, and it moves prompts: deleting a heading unfiles everything
    // under it, so a blind second attempt is not a free action.
    retry: false,
    mutationFn: deleteSalesPlaybookCategory,
    onSuccess: invalidate,
  });
}
