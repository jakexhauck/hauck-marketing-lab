import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePipelinesQuery } from "../hooks/useApi";
import { useAuth } from "./AuthContext";
import { useClient } from "./ClientContext";
import { getMockPipelinesForClient } from "../mock/pipelines";
import type { ApiPipelineSummary } from "../lib/api";

interface PipelinesContextValue {
  pipelines: ApiPipelineSummary[];
  selectedId: string | null;
  selected: ApiPipelineSummary | null;
  setSelectedId: (id: string) => void;
  isLoading: boolean;
  error: Error | null;
}

const PipelinesContext = createContext<PipelinesContextValue | null>(null);

const STORAGE_KEY = "hml.selectedPipelineId";
// Pre-rename key (carried a client name); migrated once below, then unused.
const LEGACY_STORAGE_KEY = "willis.selectedPipelineId";

function readStoredPipelineId(): string | null {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) return current;
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      localStorage.setItem(STORAGE_KEY, legacy);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
    return legacy;
  } catch {
    return null;
  }
}

export function PipelinesProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { client } = useClient();
  const useReal = Boolean(session);
  const query = usePipelinesQuery(useReal);

  // Mock mode (showroom/demo) serves a static pipeline per client so every
  // view runs through the same real-stage model as a live session.
  const pipelines = useMemo<ApiPipelineSummary[]>(
    () =>
      useReal
        ? (query.data?.pipelines ?? [])
        : getMockPipelinesForClient(client.id),
    [useReal, query.data, client.id],
  );

  const [selectedId, setSelectedIdState] = useState<string | null>(
    readStoredPipelineId,
  );

  // Default the selection to the first pipeline once they load, and heal a
  // stale stored id that no longer matches any pipeline.
  useEffect(() => {
    if (pipelines.length === 0) return;
    const valid = selectedId && pipelines.some((p) => p.id === selectedId);
    if (!valid) {
      setSelectedIdState(pipelines[0].id);
    }
  }, [pipelines, selectedId]);

  const setSelectedId = (id: string) => {
    setSelectedIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  };

  const selected = useMemo(
    () => pipelines.find((p) => p.id === selectedId) ?? null,
    [pipelines, selectedId],
  );

  const value = useMemo<PipelinesContextValue>(
    () => ({
      pipelines,
      selectedId,
      selected,
      setSelectedId,
      isLoading: useReal && query.isLoading,
      error: (useReal && (query.error as Error | null)) || null,
    }),
    [pipelines, selectedId, selected, useReal, query.isLoading, query.error],
  );

  return (
    <PipelinesContext.Provider value={value}>
      {children}
    </PipelinesContext.Provider>
  );
}

export function usePipelines(): PipelinesContextValue {
  const ctx = useContext(PipelinesContext);
  if (!ctx)
    throw new Error("usePipelines must be used inside PipelinesProvider");
  return ctx;
}
