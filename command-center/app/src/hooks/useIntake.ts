import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { IntakeAnswers } from "../lib/intake";

// Client intake: the admin side. Kept in its own file rather than appended to
// useApi.ts, which is large and covers the whole app.

export type IntakeStatus = "in_progress" | "submitted" | "approved" | "rejected";

export interface IntakeSubmissionSummary {
  id: string;
  name: string;
  niche: string;
  contactName: string;
  loginEmail: string | null;
  status: IntakeStatus;
  furthestStep: number;
  completeness: number;
  tenantId: string | null;
  submittedAt: string | null;
  createdAt: string;
}

export interface IntakeListResponse {
  submissions: IntakeSubmissionSummary[];
  counts: Partial<Record<IntakeStatus, number>>;
  total: number;
}

export interface IntakeDetail {
  id: string;
  answers: IntakeAnswers;
  status: IntakeStatus;
  furthestStep: number;
  completeness: number;
  loginEmail: string | null;
  hasPassword: boolean;
  tenantId: string | null;
  /** Why this cannot be approved, or null when it can. Straight from the server. */
  blocker: string | null;
}

export interface IntakeActionResult {
  ok: true;
  status: "approved" | "rejected";
  tenantId?: string;
  slug?: string;
  /** The tenant was created but the owner login was not. Never swallowed. */
  ownerWarning?: string;
}

export function useIntakeQueue(status: IntakeStatus | "all", enabled = true) {
  return useQuery({
    queryKey: ["admin", "intake", "list", status],
    enabled,
    // A queue Jake works through: a stale list showing an already-approved
    // submission as pending is the exact confusion to avoid.
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: () => api<IntakeListResponse>(`/api/admin/intake?status=${status}`),
  });
}

export function useIntakeSubmission(id: string | null) {
  return useQuery({
    queryKey: ["admin", "intake", "detail", id],
    enabled: Boolean(id),
    staleTime: 0,
    queryFn: () => api<IntakeDetail>(`/api/admin/intake/${id}`),
  });
}

export function useIntakeAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" }) =>
      api<IntakeActionResult>(`/api/admin/intake/${id}`, {
        method: "POST",
        body: JSON.stringify({ action }),
      }),
    onSuccess: () => {
      // Approve creates a tenant, so the client roster is stale too.
      queryClient.invalidateQueries({ queryKey: ["admin", "intake"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "clients"] });
    },
  });
}
