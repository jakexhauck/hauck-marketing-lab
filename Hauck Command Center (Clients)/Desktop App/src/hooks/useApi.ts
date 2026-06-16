import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  ApiActivityResponse,
  ApiCalendarResponse,
  ApiContactsResponse,
  ApiConversationsResponse,
  ApiInvoiceDetail,
  ApiInvoicesResponse,
  ApiLead,
  ApiLeadsResponse,
  ApiMessagesResponse,
  ApiNotesResponse,
  ApiNotificationsResponse,
  ApiPipelinesResponse,
  ApiSendResponse,
  ApiSummary,
  ApiTasksResponse,
  ApiTenantResponse,
  ApiTransactionsResponse,
  ApiStaffListResponse,
  ApiEntitlementsResponse,
  StaffWriteInput,
} from "@hauck/core";

// Centralized query keys so mutations invalidate precisely.
export const qk = {
  tenant: ["tenant"] as const,
  pipelines: ["pipelines"] as const,
  summary: ["summary"] as const,
  activity: ["activity"] as const,
  notifications: ["notifications"] as const,
  contacts: ["contacts"] as const,
  conversations: ["conversations"] as const,
  conversation: (contactId: string) => ["conversation", contactId, "messages"] as const,
  leads: ["leads"] as const,
  pipelineLeads: (pipelineId: string) => ["leads", "pipeline", pipelineId] as const,
  lead: (id: string) => ["lead", id] as const,
  leadMessages: (id: string) => ["lead", id, "messages"] as const,
  notes: (contactId: string) => ["notes", contactId] as const,
  tasks: (contactId: string) => ["tasks", contactId] as const,
  invoices: (status: string) => ["invoices", status] as const,
  invoice: (id: string) => ["invoice", id] as const,
  transactions: ["transactions"] as const,
  calendar: ["calendar", "events"] as const,
  staff: ["staff"] as const,
  entitlements: ["entitlements"] as const,
};

type QOpts<T> = Omit<UseQueryOptions<T, Error, T>, "queryKey" | "queryFn">;

// --- Queries ---------------------------------------------------------------

export function useTenantQuery(opts: QOpts<ApiTenantResponse> = {}) {
  return useQuery({
    queryKey: qk.tenant,
    queryFn: () => api<ApiTenantResponse>("/api/tenant"),
    staleTime: 10 * 60_000,
    ...opts,
  });
}

export function usePipelinesQuery(opts: QOpts<ApiPipelinesResponse> = {}) {
  return useQuery({
    queryKey: qk.pipelines,
    queryFn: () => api<ApiPipelinesResponse>("/api/pipelines"),
    staleTime: 5 * 60_000,
    ...opts,
  });
}

export function useSummaryQuery(opts: QOpts<ApiSummary> = {}) {
  return useQuery({
    queryKey: qk.summary,
    queryFn: () => api<ApiSummary>("/api/summary"),
    staleTime: 30_000,
    refetchInterval: 60_000,
    ...opts,
  });
}

export function useActivityQuery(opts: QOpts<ApiActivityResponse> = {}) {
  return useQuery({
    queryKey: qk.activity,
    queryFn: () => api<ApiActivityResponse>("/api/activity"),
    staleTime: 30_000,
    refetchInterval: 30_000,
    ...opts,
  });
}

export function useNotificationsQuery(opts: QOpts<ApiNotificationsResponse> = {}) {
  return useQuery({
    queryKey: qk.notifications,
    queryFn: () => api<ApiNotificationsResponse>("/api/notifications"),
    staleTime: 20_000,
    refetchInterval: 30_000,
    ...opts,
  });
}

export function useContactsQuery(opts: QOpts<ApiContactsResponse> = {}) {
  return useQuery({
    queryKey: qk.contacts,
    queryFn: () => api<ApiContactsResponse>("/api/contacts"),
    staleTime: 60_000,
    ...opts,
  });
}

export function useConversationsQuery(opts: QOpts<ApiConversationsResponse> = {}) {
  return useQuery({
    queryKey: qk.conversations,
    queryFn: () => api<ApiConversationsResponse>("/api/conversations"),
    staleTime: 30_000,
    refetchInterval: 30_000,
    ...opts,
  });
}

export function useConversationMessagesQuery(
  contactId: string | undefined,
  opts: QOpts<ApiMessagesResponse> = {},
) {
  return useQuery({
    queryKey: qk.conversation(contactId ?? ""),
    queryFn: () => api<ApiMessagesResponse>(`/api/conversations/${contactId}/messages`),
    enabled: !!contactId,
    staleTime: 0,
    refetchInterval: 10_000,
    ...opts,
  });
}

export function useLeadsQuery(
  pipelineId: string | undefined,
  opts: QOpts<ApiLeadsResponse> = {},
) {
  return useQuery({
    queryKey: pipelineId ? qk.pipelineLeads(pipelineId) : qk.leads,
    queryFn: () =>
      api<ApiLeadsResponse>(
        pipelineId ? `/api/leads?pipelineId=${encodeURIComponent(pipelineId)}` : "/api/leads",
      ),
    staleTime: 15_000,
    ...opts,
  });
}

export function useLeadQuery(id: string | undefined, opts: QOpts<{ lead: ApiLead }> = {}) {
  return useQuery({
    queryKey: qk.lead(id ?? ""),
    queryFn: () => api<{ lead: ApiLead }>(`/api/leads/${id}`),
    enabled: !!id,
    staleTime: 10_000,
    ...opts,
  });
}

export function useLeadMessagesQuery(
  id: string | undefined,
  opts: QOpts<ApiMessagesResponse> = {},
) {
  return useQuery({
    queryKey: qk.leadMessages(id ?? ""),
    queryFn: () => api<ApiMessagesResponse>(`/api/leads/${id}/messages`),
    enabled: !!id,
    staleTime: 0,
    refetchInterval: 10_000,
    ...opts,
  });
}

export function useNotesQuery(contactId: string | undefined, opts: QOpts<ApiNotesResponse> = {}) {
  return useQuery({
    queryKey: qk.notes(contactId ?? ""),
    queryFn: () => api<ApiNotesResponse>(`/api/contacts/${contactId}/notes`),
    enabled: !!contactId,
    staleTime: 30_000,
    ...opts,
  });
}

export function useTasksQuery(contactId: string | undefined, opts: QOpts<ApiTasksResponse> = {}) {
  return useQuery({
    queryKey: qk.tasks(contactId ?? ""),
    queryFn: () => api<ApiTasksResponse>(`/api/contacts/${contactId}/tasks`),
    enabled: !!contactId,
    staleTime: 30_000,
    ...opts,
  });
}

export function useInvoicesQuery(status = "all", opts: QOpts<ApiInvoicesResponse> = {}) {
  return useQuery({
    queryKey: qk.invoices(status),
    queryFn: () =>
      api<ApiInvoicesResponse>(
        status && status !== "all" ? `/api/invoices?status=${status}` : "/api/invoices",
      ),
    staleTime: 60_000,
    ...opts,
  });
}

export function useInvoiceQuery(id: string | undefined, opts: QOpts<{ invoice: ApiInvoiceDetail }> = {}) {
  return useQuery({
    queryKey: qk.invoice(id ?? ""),
    queryFn: () => api<{ invoice: ApiInvoiceDetail }>(`/api/invoices/${id}`),
    enabled: !!id,
    staleTime: 60_000,
    ...opts,
  });
}

export function useTransactionsQuery(opts: QOpts<ApiTransactionsResponse> = {}) {
  return useQuery({
    queryKey: qk.transactions,
    queryFn: () => api<ApiTransactionsResponse>("/api/payments/transactions"),
    staleTime: 60_000,
    ...opts,
  });
}

export function useCalendarEventsQuery(opts: QOpts<ApiCalendarResponse> = {}) {
  return useQuery({
    queryKey: qk.calendar,
    queryFn: () => api<ApiCalendarResponse>("/api/calendar/events"),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    ...opts,
  });
}

// --- Mutations -------------------------------------------------------------

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      leadId: string;
      status?: string;
      pipelineStageId?: string;
      value?: number | null;
      notes?: string;
    }) =>
      api<{ lead: ApiLead }>(`/api/leads/${vars.leadId}`, {
        method: "PATCH",
        body: JSON.stringify(vars),
      }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: qk.leads });
      qc.invalidateQueries({ queryKey: ["leads", "pipeline"] });
      qc.invalidateQueries({ queryKey: qk.lead(vars.leadId) });
      qc.invalidateQueries({ queryKey: qk.summary });
    },
  });
}

// Optimistic stage move for the board: reflect the drag immediately, roll back
// on error. Mirrors the mobile app's useMoveLeadStage.
export function useMoveLeadStage(pipelineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      leadId: string;
      pipelineStageId?: string;
      status?: string;
      value?: number | null;
    }) =>
      api<{ lead: ApiLead }>(`/api/leads/${vars.leadId}`, {
        method: "PATCH",
        body: JSON.stringify(vars),
      }),
    onMutate: async (vars) => {
      const key = qk.pipelineLeads(pipelineId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ApiLeadsResponse>(key);
      if (prev) {
        qc.setQueryData<ApiLeadsResponse>(key, {
          ...prev,
          leads: prev.leads.map((l) =>
            l.id === vars.leadId
              ? {
                  ...l,
                  pipelineStageId: vars.pipelineStageId ?? l.pipelineStageId,
                  status: vars.status ?? l.status,
                  value: vars.value ?? l.value,
                }
              : l,
          ),
        });
      }
      return { prev, key };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.pipelineLeads(pipelineId) });
      qc.invalidateQueries({ queryKey: qk.summary });
    },
  });
}

export function useSendLeadMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { leadId: string; channel: string; body: string; subject?: string }) =>
      api<ApiSendResponse>(`/api/leads/${vars.leadId}/send`, {
        method: "POST",
        body: JSON.stringify({ channel: vars.channel, body: vars.body, subject: vars.subject }),
      }),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: qk.leadMessages(vars.leadId) }),
  });
}

export function useSendConversationMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { contactId: string; channel: string; body: string; subject?: string }) =>
      api<ApiSendResponse>(`/api/conversations/${vars.contactId}/send`, {
        method: "POST",
        body: JSON.stringify({ channel: vars.channel, body: vars.body, subject: vars.subject }),
      }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: qk.conversation(vars.contactId) });
      qc.invalidateQueries({ queryKey: qk.conversations });
    },
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number } | { all: true }) =>
      api<{ ok: boolean; unreadCount: number }>("/api/notifications/read", {
        method: "POST",
        body: JSON.stringify(vars),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications }),
  });
}

export function useCreateNote(contactId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      api(`/api/contacts/${contactId}/notes`, { method: "POST", body: JSON.stringify({ body }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notes(contactId) }),
  });
}

export function useDeleteNote(contactId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) =>
      api(`/api/contacts/${contactId}/notes/${noteId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notes(contactId) }),
  });
}

export function useCreateTask(contactId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { title: string; dueDate?: string }) =>
      api(`/api/contacts/${contactId}/tasks`, { method: "POST", body: JSON.stringify(vars) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tasks(contactId) }),
  });
}

export function useToggleTask(contactId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { taskId: string; completed: boolean }) =>
      api(`/api/contacts/${contactId}/tasks/${vars.taskId}/completed`, {
        method: "PUT",
        body: JSON.stringify({ completed: vars.completed }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tasks(contactId) }),
  });
}

export function useDeleteTask(contactId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) =>
      api(`/api/contacts/${contactId}/tasks/${taskId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tasks(contactId) }),
  });
}

// --- Staff & permissions (owner-only) --------------------------------------

export function useStaffQuery(opts: QOpts<ApiStaffListResponse> = {}) {
  return useQuery({
    queryKey: qk.staff,
    queryFn: () => api<ApiStaffListResponse>("/api/staff"),
    staleTime: 30_000,
    ...opts,
  });
}

// The capabilities the business has enabled: bounds the grant toggles the owner
// can flip when adding/editing staff.
export function useEntitlementsQuery(opts: QOpts<ApiEntitlementsResponse> = {}) {
  return useQuery({
    queryKey: qk.entitlements,
    queryFn: () => api<ApiEntitlementsResponse>("/api/entitlements"),
    staleTime: 5 * 60_000,
    ...opts,
  });
}

export function useCreateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StaffWriteInput) =>
      api<{ ok: boolean; id: string; ghlLinked: boolean; ghlProvisioning: boolean }>("/api/staff", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.staff }),
  });
}

export function useUpdateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; input: Partial<StaffWriteInput> }) =>
      api(`/api/staff/${vars.id}`, { method: "PATCH", body: JSON.stringify(vars.input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.staff }),
  });
}

export function useDisableStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/staff/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.staff }),
  });
}
