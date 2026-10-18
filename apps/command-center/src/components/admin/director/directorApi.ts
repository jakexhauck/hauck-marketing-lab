import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import type { AgentId } from "../../../lib/agents";
import type { DirectorResponse, DirectorStage, DirectorTask, SopOwner } from "../../../lib/director";

// Every call the Director and the SOPs graph make (functions/api/admin/director).
// One read for every agent; each write refetches it, so both pages always show
// the same board.

const BASE = "/api/admin/director";
const KEY = ["admin", "director"] as const;

export interface Suggestion {
  stageId: string;
  name: string;
  owner: SopOwner;
  steps: string[];
}

export interface TaskPatchBody {
  name?: string;
  owner?: SopOwner;
  stageId?: string;
  index?: number;
  how?: string;
  approve?: boolean;
  restore?: boolean;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const directorApi = {
  read: () => api<DirectorResponse>(BASE),
  addTask: (b: { stageId: string; name: string; owner: SopOwner; steps?: string[] }) =>
    api<{ task: DirectorTask }>(`${BASE}/tasks`, json("POST", b)),
  patchTask: (id: string, b: TaskPatchBody) => api<{ task: DirectorTask }>(`${BASE}/tasks/${id}`, json("PATCH", b)),
  removeTask: (id: string) => api<{ ok: true }>(`${BASE}/tasks/${id}`, { method: "DELETE" }),
  addStage: (agent: AgentId, name: string) => api<{ stage: DirectorStage }>(`${BASE}/stages`, json("POST", { agent, name })),
  patchStage: (id: string, b: { name?: string; index?: number }) =>
    api<{ stage: DirectorStage }>(`${BASE}/stages/${id}`, json("PATCH", b)),
  removeStage: (id: string) => api<{ ok: true }>(`${BASE}/stages/${id}`, { method: "DELETE" }),
  suggest: (agent: AgentId, text: string) => api<{ suggestion: Suggestion }>(`${BASE}/suggest`, json("POST", { agent, text })),
};

export function useDirector() {
  return useQuery({ queryKey: KEY, queryFn: directorApi.read, staleTime: 10_000 });
}

// A write, then the board again. Errors are left on the mutation for the caller.
export function useDirectorWrite<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: KEY }) });
}
