import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createColdCallAsset,
  deleteColdCallAsset,
  getColdCallAssets,
  updateColdCallAsset,
  type ColdCallAsset,
} from "../lib/api";

// The cold caller's shelf (0058): the dialing script variations and the
// documents filed beside them.
//
// One query serves both Settings and the floating panel a caller reads mid-call,
// because they are the same list asked two different questions. The numbers on
// each variation are recomputed server-side on every read, so invalidating after
// a dial is what keeps the script test current.

const ASSETS_KEY = ["admin", "cold-call", "assets"] as const;

export function useColdCallAssetsQuery(includeArchived = false) {
  return useQuery({
    queryKey: [...ASSETS_KEY, includeArchived ? "all" : "live"],
    // Short: a caller may be dialing while Jake edits the script they are
    // reading, and the stale one is the one being said out loud.
    staleTime: 30_000,
    queryFn: () => getColdCallAssets(includeArchived),
  });
}

// The live variations, in Jake's order. The picker and the fallback that makes
// "tracked every single time" true both read this.
export function useColdCallScripts(): ColdCallAsset[] {
  const query = useColdCallAssetsQuery();
  return useMemo(
    () => (query.data?.assets ?? []).filter((a) => a.kind === "script" && !a.archivedAt),
    [query.data],
  );
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ASSETS_KEY });
  };
}

export function useCreateColdCallAsset() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: createColdCallAsset,
    onSuccess: invalidate,
  });
}

export function useUpdateColdCallAsset() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: updateColdCallAsset,
    onSuccess: invalidate,
  });
}

export function useDeleteColdCallAsset() {
  const invalidate = useInvalidate();
  return useMutation({
    // Not retried: the endpoint refuses a delete that would orphan recorded
    // dials, and asking again will not change its mind.
    retry: false,
    mutationFn: deleteColdCallAsset,
    onSuccess: invalidate,
  });
}
