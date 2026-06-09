import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type ApiLead,
  type ApiPipeline,
  type ApiPipelineSummary,
  type ApiSummary,
  type ApiMessage,
  type ApiContact,
  type ApiConversation,
  type ApiActivity,
  type ApiNote,
  type AdminClient,
} from "../lib/api";
import type { LeadStage } from "../types";
import { reverseMapStage } from "../lib/stageMap";

export function usePipelineQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["pipeline"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: () => api<ApiPipeline>("/api/pipeline"),
  });
}

// All pipelines for the tenant, each with its real stage list.
export function usePipelinesQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["pipelines"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: () =>
      api<{ pipelines: ApiPipelineSummary[] }>("/api/pipelines"),
  });
}

export function useLeadsQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["leads"],
    enabled,
    queryFn: () => api<{ leads: ApiLead[]; total: number }>("/api/leads"),
  });
}

// Leads for a single pipeline, filtered server-side by pipeline_id.
export function usePipelineLeadsQuery(
  pipelineId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["leads", "pipeline", pipelineId],
    enabled: enabled && !!pipelineId,
    staleTime: 15_000,
    queryFn: () =>
      api<{ leads: ApiLead[]; total: number }>(
        `/api/leads?pipelineId=${encodeURIComponent(pipelineId as string)}`,
      ),
  });
}

// Cross-pipeline counts for the Home dashboard.
export function useSummaryQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["summary"],
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: () => api<ApiSummary>("/api/summary"),
  });
}

// Recent webhook-sourced events for the Home activity feed.
export function useActivityQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["activity"],
    enabled,
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: () => api<{ activity: ApiActivity[] }>("/api/activity"),
  });
}

export function useContactsQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["contacts"],
    enabled,
    staleTime: 60_000,
    queryFn: () =>
      api<{ contacts: ApiContact[]; total: number }>("/api/contacts"),
  });
}

export function useConversationsQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["conversations"],
    enabled,
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: () =>
      api<{ conversations: ApiConversation[]; total: number }>(
        "/api/conversations",
      ),
  });
}

export function useConversationMessagesQuery(
  contactId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["conversation", contactId, "messages"],
    enabled: enabled && !!contactId,
    staleTime: 0,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    queryFn: () =>
      api<{ conversationId?: string; messages: ApiMessage[] }>(
        `/api/conversations/${contactId}/messages`,
      ),
  });
}

interface SendConversationSmsInput {
  contactId: string;
  body: string;
}

export function useAdminClientsQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "clients"],
    enabled,
    staleTime: 60_000,
    queryFn: () =>
      api<{ clients: AdminClient[]; total: number }>("/api/admin/clients"),
  });
}

export function useSendConversationSms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SendConversationSmsInput) =>
      api<{ ok: boolean; messageId?: string }>(
        `/api/conversations/${input.contactId}/sms`,
        {
          method: "POST",
          body: JSON.stringify({ body: input.body }),
        },
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: ["conversation", vars.contactId, "messages"],
      });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useLeadQuery(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["lead", id],
    enabled: enabled && !!id,
    staleTime: 10_000,
    queryFn: () => api<{ lead: ApiLead }>(`/api/leads/${id}`),
  });
}

export function useMessagesQuery(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["lead", id, "messages"],
    enabled: enabled && !!id,
    staleTime: 0,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    queryFn: () =>
      api<{ conversationId?: string; messages: ApiMessage[] }>(
        `/api/leads/${id}/messages`,
      ),
  });
}

interface UpdateLeadInput {
  leadId: string;
  appStage?: LeadStage;
  value?: number | null;
  notes?: string | null;
  pipelineStages?: { id: string; name: string }[];
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateLeadInput) => {
      const body: Record<string, unknown> = {};
      if (input.appStage === "won") body.status = "won";
      else if (input.appStage === "lost") body.status = "lost";
      else if (input.appStage) body.status = "open";

      if (input.appStage && input.pipelineStages) {
        const stageId = reverseMapStage(input.appStage, input.pipelineStages);
        if (stageId) body.pipelineStageId = stageId;
      }
      if (input.value !== undefined) body.value = input.value;
      if (input.notes !== undefined) body.notes = input.notes;

      return api<{ lead: ApiLead }>(`/api/leads/${input.leadId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", vars.leadId] });
    },
  });
}

interface SendSmsInput {
  leadId: string;
  body: string;
}

export function useSendSms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SendSmsInput) =>
      api<{ ok: boolean; messageId?: string }>(
        `/api/leads/${input.leadId}/sms`,
        {
          method: "POST",
          body: JSON.stringify({ body: input.body }),
        },
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["lead", vars.leadId, "messages"] });
    },
  });
}

// Notes attached to a contact (newest-first), read/write through GHL.
export function useNotesQuery(contactId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["notes", contactId],
    enabled: enabled && !!contactId,
    staleTime: 30_000,
    queryFn: () =>
      api<{ notes: ApiNote[] }>(`/api/contacts/${contactId}/notes`),
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { contactId: string; body: string }) =>
      api<{ note: ApiNote | null }>(`/api/contacts/${input.contactId}/notes`, {
        method: "POST",
        body: JSON.stringify({ body: input.body }),
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["notes", vars.contactId] });
    },
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { contactId: string; noteId: string; body: string }) =>
      api<{ note: ApiNote | null }>(
        `/api/contacts/${input.contactId}/notes/${input.noteId}`,
        { method: "PUT", body: JSON.stringify({ body: input.body }) },
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["notes", vars.contactId] });
    },
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { contactId: string; noteId: string }) =>
      api<{ ok: boolean }>(
        `/api/contacts/${input.contactId}/notes/${input.noteId}`,
        { method: "DELETE" },
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["notes", vars.contactId] });
    },
  });
}
