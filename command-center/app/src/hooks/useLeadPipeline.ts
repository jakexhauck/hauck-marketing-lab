import { useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { useClient } from "../context/ClientContext";
import { usePipelinesQuery } from "./useApi";
import { getMockPipelinesForClient } from "../mock/pipelines";
import {
  resolveLeadPipeline,
  type LeadPipelineKind,
} from "../lib/leadPipelines";
import type { ApiPipelineSummary } from "../lib/api";

// The Sales or Trash pipeline for the current tenant, resolved by name. Demo /
// preview sessions use the static mock pipelines so the board renders through
// the same shape as a live session.
export function useLeadPipeline(kind: LeadPipelineKind) {
  const { session } = useAuth();
  const { client } = useClient();
  const useReal = Boolean(session);
  const query = usePipelinesQuery(useReal);

  const pipelines: ApiPipelineSummary[] = useReal
    ? query.data?.pipelines ?? []
    : getMockPipelinesForClient(client.id);

  const pipeline = useMemo(
    () => resolveLeadPipeline(pipelines, kind),
    [pipelines, kind],
  );

  return {
    pipeline,
    isLoading: useReal && query.isLoading,
    isError: useReal && query.isError,
    error: (useReal && (query.error as Error | null)) || null,
  };
}
