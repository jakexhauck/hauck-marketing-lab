import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { SetupSection, SetupStepRow } from "../lib/setupSteps";

// The setup checklist itself: read by Client setup, edited by Management.
//
// One query key for both, so editing a step on Management is reflected the next
// time Client setup is opened without either page knowing about the other.

const KEY = ["admin", "onboarding", "steps"];

export interface SetupStepsResponse {
  steps: SetupStepRow[];
  /** True when the table does not exist yet, so the page can say so plainly. */
  needsMigration: boolean;
}

export function useSetupSteps() {
  return useQuery({
    queryKey: KEY,
    staleTime: 30_000,
    queryFn: () => api<SetupStepsResponse>("/api/admin/onboarding/steps"),
  });
}

export interface NewStep {
  section: SetupSection;
  label: string;
  note?: string;
  groupLabel?: string;
  position?: number;
  required?: boolean;
}

export function useCreateSetupStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (step: NewStep) =>
      api<{ ok: true; step: SetupStepRow }>("/api/admin/onboarding/steps", {
        method: "POST",
        body: JSON.stringify(step),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateSetupStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Partial<NewStep>) =>
      api<{ ok: true; step: SetupStepRow }>(`/api/admin/onboarding/steps/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useArchiveSetupStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ ok: true }>(`/api/admin/onboarding/steps/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}
