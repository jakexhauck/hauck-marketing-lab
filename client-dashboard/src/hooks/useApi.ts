import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type ApiLead,
  type ApiPipelineSummary,
  type ApiSummary,
  type ApiMessage,
  type ApiContact,
  type ApiConversation,
  type ApiActivity,
  type ApiNotification,
  type ApiNote,
  type ApiTask,
  type ApiInvoice,
  type ApiInvoiceDetail,
  type ApiTransaction,
  type ApiCalendarEvent,
  type AdminClient,
} from "../lib/api";
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

interface NotificationsResponse {
  notifications: ApiNotification[];
  unreadCount: number;
}

// The notification center feed + unread badge. Polls so the bell stays current
// without a manual refresh; the service worker also nudges it on a push.
export function useNotificationsQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["notifications"],
    enabled,
    staleTime: 20_000,
    refetchInterval: 30_000,
    queryFn: () => api<NotificationsResponse>("/api/notifications"),
  });
}

// Mark one notification (by id) or all of them (all: true) read. Optimistically
// drops the unread count and flips read_at so the badge and feed update at once.
export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number } | { all: true }) =>
      api<{ ok: boolean; unreadCount: number }>("/api/notifications/read", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["notifications"] });
      const previous = qc.getQueryData<NotificationsResponse>(["notifications"]);
      if (previous) {
        const now = new Date().toISOString();
        const next = previous.notifications.map((n) =>
          "all" in input || n.id === input.id
            ? { ...n, read_at: n.read_at ?? now }
            : n,
        );
        qc.setQueryData<NotificationsResponse>(["notifications"], {
          notifications: next,
          unreadCount: next.filter((n) => !n.read_at).length,
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(["notifications"], context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
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
      api<{
        conversationId?: string;
        messages: ApiMessage[];
        truncated?: boolean;
        unreadCount?: number;
        defaultChannel?: string;
        availableChannels?: string[];
      }>(`/api/conversations/${contactId}/messages`),
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

interface SendChannelMessageInput {
  contactId: string;
  channel: string;
  body: string;
  subject?: string;
}

// Channel-aware send for the conversations path (SMS, Email, FB, IG, ...).
export function useSendConversationMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SendChannelMessageInput) =>
      api<{ ok: boolean; messageId?: string }>(
        `/api/conversations/${input.contactId}/send`,
        {
          method: "POST",
          body: JSON.stringify({
            channel: input.channel,
            body: input.body,
            subject: input.subject,
          }),
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
      api<{
        conversationId?: string;
        messages: ApiMessage[];
        truncated?: boolean;
        unreadCount?: number;
        defaultChannel?: string;
        availableChannels?: string[];
      }>(`/api/leads/${id}/messages`),
  });
}

interface UpdateLeadInput {
  leadId: string;
  // Explicit GHL ids/status only; the API never guesses from names.
  status?: "open" | "won" | "lost";
  pipelineStageId?: string;
  value?: number | null;
  notes?: string | null;
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateLeadInput) => {
      const body: Record<string, unknown> = {};
      if (input.status !== undefined) body.status = input.status;
      if (input.pipelineStageId !== undefined)
        body.pipelineStageId = input.pipelineStageId;
      if (input.value !== undefined) body.value = input.value;
      if (input.notes !== undefined) body.notes = input.notes;

      return api<{ lead: ApiLead }>(`/api/leads/${input.leadId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    onSuccess: (_data, vars) => {
      // ["leads"] prefix covers the global list and every per-pipeline list.
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", vars.leadId] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    },
  });
}

interface MoveLeadInput {
  leadId: string;
  pipelineStageId?: string;
  status?: "open" | "won" | "lost";
  value?: number;
}

// Board stage-move: PATCH a lead's stage/status directly by GHL id, with an
// optimistic update on the active pipeline's lead list and rollback on error.
export function useMoveLeadStage(pipelineId: string | null) {
  const qc = useQueryClient();
  const key = ["leads", "pipeline", pipelineId];
  return useMutation({
    mutationFn: (input: MoveLeadInput) =>
      api<{ lead: ApiLead }>(`/api/leads/${input.leadId}`, {
        method: "PATCH",
        body: JSON.stringify({
          pipelineStageId: input.pipelineStageId,
          status: input.status,
          value: input.value,
        }),
      }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<{ leads: ApiLead[]; total: number }>(key);
      if (previous) {
        qc.setQueryData(key, {
          ...previous,
          leads: previous.leads.map((l) =>
            l.id === input.leadId
              ? {
                  ...l,
                  pipelineStageId: input.pipelineStageId ?? l.pipelineStageId,
                  status: input.status ?? l.status,
                  value: input.value ?? l.value,
                }
              : l,
          ),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
    },
    onSettled: (_data, _err, vars) => {
      // ["leads"] prefix covers the global list and every per-pipeline list,
      // so other views never show the stale stage (fix 3.4).
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", vars.leadId] });
      qc.invalidateQueries({ queryKey: ["summary"] });
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

interface SendLeadMessageInput {
  leadId: string;
  channel: string;
  body: string;
  subject?: string;
}

// Channel-aware send for the leads path; mirrors useSendConversationMessage.
export function useSendLeadMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SendLeadMessageInput) =>
      api<{ ok: boolean; messageId?: string }>(
        `/api/leads/${input.leadId}/send`,
        {
          method: "POST",
          body: JSON.stringify({
            channel: input.channel,
            body: input.body,
            subject: input.subject,
          }),
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

// Tasks attached to a contact (open-first, soonest-due), read/write through GHL.
export function useTasksQuery(contactId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["tasks", contactId],
    enabled: enabled && !!contactId,
    staleTime: 30_000,
    queryFn: () =>
      api<{ tasks: ApiTask[] }>(`/api/contacts/${contactId}/tasks`),
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      contactId: string;
      title: string;
      dueDate?: string;
    }) =>
      api<{ task: ApiTask | null }>(`/api/contacts/${input.contactId}/tasks`, {
        method: "POST",
        body: JSON.stringify({ title: input.title, dueDate: input.dueDate }),
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["tasks", vars.contactId] });
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      contactId: string;
      taskId: string;
      title: string;
      dueDate?: string;
    }) =>
      api<{ task: ApiTask | null }>(
        `/api/contacts/${input.contactId}/tasks/${input.taskId}`,
        {
          method: "PUT",
          body: JSON.stringify({ title: input.title, dueDate: input.dueDate }),
        },
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["tasks", vars.contactId] });
    },
  });
}

// Optimistic completion: flip the checkbox immediately, roll back on error.
export function useToggleTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      contactId: string;
      taskId: string;
      completed: boolean;
    }) =>
      api<{ task: ApiTask | null }>(
        `/api/contacts/${input.contactId}/tasks/${input.taskId}/completed`,
        { method: "PUT", body: JSON.stringify({ completed: input.completed }) },
      ),
    onMutate: async (vars) => {
      const key = ["tasks", vars.contactId];
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<{ tasks: ApiTask[] }>(key);
      if (previous) {
        qc.setQueryData<{ tasks: ApiTask[] }>(key, {
          tasks: previous.tasks.map((t) =>
            t.id === vars.taskId ? { ...t, completed: vars.completed } : t,
          ),
        });
      }
      return { previous };
    },
    onError: (_err, vars, context) => {
      if (context?.previous) {
        qc.setQueryData(["tasks", vars.contactId], context.previous);
      }
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ["tasks", vars.contactId] });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { contactId: string; taskId: string }) =>
      api<{ ok: boolean }>(
        `/api/contacts/${input.contactId}/tasks/${input.taskId}`,
        { method: "DELETE" },
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["tasks", vars.contactId] });
    },
  });
}

// Billing: invoices + payment transactions, read-only through GHL.
export function useInvoicesQuery(status: string, enabled: boolean) {
  return useQuery({
    queryKey: ["invoices", status],
    enabled,
    staleTime: 60_000,
    queryFn: () =>
      api<{ invoices: ApiInvoice[]; total: number }>(
        `/api/invoices${status && status !== "all" ? `?status=${encodeURIComponent(status)}` : ""}`,
      ),
  });
}

export function useInvoiceQuery(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["invoice", id],
    enabled: enabled && !!id,
    staleTime: 60_000,
    queryFn: () => api<{ invoice: ApiInvoiceDetail }>(`/api/invoices/${id}`),
  });
}

export function useTransactionsQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["transactions"],
    enabled,
    staleTime: 60_000,
    queryFn: () =>
      api<{ transactions: ApiTransaction[]; total: number }>(
        "/api/payments/transactions",
      ),
  });
}

// Upcoming appointments (now to +30d by default), read-only through GHL.
export function useCalendarEventsQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["calendar", "events"],
    enabled,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: () =>
      api<{ events: ApiCalendarEvent[]; timezone: string | null }>(
        "/api/calendar/events",
      ),
  });
}
