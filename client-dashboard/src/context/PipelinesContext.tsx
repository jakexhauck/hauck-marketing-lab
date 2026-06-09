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

const STORAGE_KEY = "willis.selectedPipelineId";

export function PipelinesProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const useReal = Boolean(session);
  const query = usePipelinesQuery(useReal);

  const pipelines = useMemo<ApiPipelineSummary[]>(
    () => query.data?.pipelines ?? [],
    [query.data],
  );

  const [selectedId, setSelectedIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

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
