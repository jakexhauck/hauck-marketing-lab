import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  getAdminOverview,
  getConstraints,
  saveConstraint,
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
  type ApiTransactionsResponse,
  type ApiCalendarEvent,
  type ApiTenant,
  type AdminClient,
  type AdminClientDetailResponse,
  type ApiReviewsResponse,
  type PillarConstraint,
} from "../lib/api";
import { type Job } from "../lib/jobsPipeline";
import { type WebsiteAnalytics } from "./useWebsiteAnalytics";
import { type WebsiteSite, type WebsitePageItem } from "./useWebsitePages";
import { normalizeAdsInsights, type AdsInsightsResponse } from "../lib/adsInsights";
import { normalizeAdsMedia, type AdsMediaResponse } from "./useAdsMedia";

// Tenant display config (branding, labels, real spend). Changes rarely; a
// long staleTime avoids refetching it on every screen.
export function useTenantQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["tenant"],
    enabled,
    staleTime: 10 * 60_000,
    queryFn: () => api<{ tenant: ApiTenant | null }>("/api/tenant"),
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

// Completed-job contacts for the Google Reviews surface. Newest first; each
// flagged with whether the review campaign already started.
export function useReviewsQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["reviews"],
    enabled,
    staleTime: 30_000,
    queryFn: () => api<ApiReviewsResponse>("/api/reviews"),
  });
}

// Start the review campaign for one contact: adds the review tag in GHL, which
// enrolls them. Optimistically flips that row to started so the button settles
// immediately; rolls back on error.
export function useStartReviewCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { contactId: string }) =>
      api<{ ok: boolean }>("/api/reviews", {
        method: "POST",
        body: JSON.stringify({ contactId: input.contactId }),
      }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["reviews"] });
      const previous = qc.getQueryData<ApiReviewsResponse>(["reviews"]);
      if (previous) {
        qc.setQueryData<ApiReviewsResponse>(["reviews"], {
          ...previous,
          contacts: previous.contacts.map((c) =>
            c.contactId === input.contactId ? { ...c, started: true } : c,
          ),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(["reviews"], context.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["reviews"] });
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

// One client's full admin detail (business info, entitlements, staff,
// GHL-identified members, recent activity) for the Service Delivery cockpit.
// Keyed by tenantId so the header and the Overview tab (Task 3.3) mounting
// side by side share one cached request instead of fetching twice.
export function useAdminClientDetailQuery(tenantId: string, enabled = true) {
  return useQuery({
    queryKey: ["admin", "clients", tenantId],
    enabled: enabled && !!tenantId,
    staleTime: 30_000,
    queryFn: () => api<AdminClientDetailResponse>(`/api/admin/clients/${tenantId}`),
  });
}

// One client's real GA4 numbers for the Fulfillment cockpit's Web Design >
// Analytics panel, from GET /api/admin/clients/:tenantId/website/analytics. The
// same WebsiteAnalytics shape the client's own Insights reads; { connected:
// false } when the client has no GA4 property wired.
export function useAdminWebsiteAnalyticsQuery(tenantId: string, enabled = true) {
  return useQuery({
    queryKey: ["admin", "clients", tenantId, "website", "analytics"],
    enabled: enabled && !!tenantId,
    staleTime: 60_000,
    queryFn: () =>
      api<WebsiteAnalytics>(`/api/admin/clients/${tenantId}/website/analytics`),
  });
}

// One client's live site pages (from their GHL Sites) for the Fulfillment
// cockpit's Web Design > Pages panel, from GET
// /api/admin/clients/:tenantId/website/pages. `unavailable` when GHL could not
// be read; the panel joins each path onto the client's website_url to preview.
export function useAdminWebsitePagesQuery(tenantId: string, enabled = true) {
  return useQuery({
    queryKey: ["admin", "clients", tenantId, "website", "pages"],
    enabled: enabled && !!tenantId,
    staleTime: 5 * 60_000,
    queryFn: () =>
      api<{ site: WebsiteSite | null; pages: WebsitePageItem[]; unavailable?: boolean }>(
        `/api/admin/clients/${tenantId}/website/pages`,
      ),
  });
}

// One website change request as the admin endpoint returns it (the same wire
// shape the client's own Request-a-Change reads).
export interface AdminWebsiteRequest {
  id: string;
  page: string;
  device: "desktop" | "mobile";
  xPct: number;
  yPct: number;
  note: string;
  status: "open" | "in_progress" | "done";
  createdAt: string;
}

// One client's website change requests (read-only) for the Fulfillment cockpit's
// Web Design > Change Requests panel, from GET
// /api/admin/clients/:tenantId/website/requests. There is no admin write: Jake
// makes the edit in GHL.
export function useAdminWebsiteRequestsQuery(tenantId: string, enabled = true) {
  return useQuery({
    queryKey: ["admin", "clients", tenantId, "website", "requests"],
    enabled: enabled && !!tenantId,
    staleTime: 60_000,
    queryFn: () =>
      api<{ requests: AdminWebsiteRequest[]; unavailable?: boolean }>(
        `/api/admin/clients/${tenantId}/website/requests`,
      ),
  });
}

// One client's real Meta insights for the Fulfillment cockpit's Paid Ads tab
// (Campaigns hero + Data & Leads metrics), from GET
// /api/admin/clients/:tenantId/ads/insights. Same shared adsCore.buildAdsInsights
// as the client's own Overview, so `configured: false` means Meta genuinely
// isn't wired for this tenant, not a fetch failure. `select` normalizes on read
// (mirrors useAdsInsights) so a stale/partial cached payload can't crash a tab.
export function useAdminAdsInsightsQuery(tenantId: string, enabled = true) {
  return useQuery({
    queryKey: ["admin", "clients", tenantId, "ads", "insights"],
    enabled: enabled && !!tenantId,
    staleTime: 60_000,
    queryFn: () => api<AdsInsightsResponse>(`/api/admin/clients/${tenantId}/ads/insights`),
    select: normalizeAdsInsights,
  });
}

// One client's real Meta ad media library for the Fulfillment cockpit's Paid
// Ads > Ad Library panel, from GET /api/admin/clients/:tenantId/ads/media.
export function useAdminAdsMediaQuery(tenantId: string, enabled = true) {
  return useQuery({
    queryKey: ["admin", "clients", tenantId, "ads", "media"],
    enabled: enabled && !!tenantId,
    staleTime: 5 * 60_000,
    queryFn: () => api<AdsMediaResponse>(`/api/admin/clients/${tenantId}/ads/media`),
    select: normalizeAdsMedia,
  });
}

// A row from GET /api/admin/clients/:tenantId/ads/leads (mirrors the client's
// local ApiAdLeadRow in routes/paid-ads/AdsLeads.tsx: ApiLead plus the resolved
// GHL stage name).
export interface AdminAdLeadRow {
  id: string;
  name: string;
  stageName?: string;
  lastActivityAt: string;
}

// One client's real Paid Ad's Pipeline leads for the Fulfillment cockpit's Paid
// Ads > Data & Leads panel, from GET /api/admin/clients/:tenantId/ads/leads.
// `configError: "pipeline_not_found"` when this tenant has no Paid Ad's
// Pipeline yet (honest empty, never a fabricated lead).
export function useAdminAdsLeadsQuery(tenantId: string, enabled = true) {
  return useQuery({
    queryKey: ["admin", "clients", tenantId, "ads", "leads"],
    enabled: enabled && !!tenantId,
    staleTime: 60_000,
    queryFn: () =>
      api<{ leads: AdminAdLeadRow[]; total: number; configError?: "pipeline_not_found" }>(
        `/api/admin/clients/${tenantId}/ads/leads`,
      ),
  });
}

// One draft creative from the agency's internal Ad Library tracker (migration
// 0027). This never touches Meta; it is the operator's own draft, tracked
// per tenant. Pushing a creative live in the client's ad account is Phase 2b.
export interface AdCreative {
  id: string;
  mediaRef: string | null;
  headline: string;
  primaryText: string;
  status: "draft" | "approved" | "live";
  createdBy: string | null;
  createdAt: string;
}

// This client's Ad Library draft creatives, from GET
// /api/admin/clients/:tenantId/ads/creatives. `unavailable: true` when the
// 0027 migration has not been applied yet in this environment (honest empty,
// never a fabricated row).
export function useAdminAdsCreativesQuery(tenantId: string, enabled = true) {
  return useQuery({
    queryKey: ["admin", "clients", tenantId, "ads", "creatives"],
    enabled: enabled && !!tenantId,
    staleTime: 30_000,
    queryFn: () =>
      api<{ creatives: AdCreative[]; unavailable?: boolean }>(
        `/api/admin/clients/${tenantId}/ads/creatives`,
      ),
  });
}

export interface CreateAdCreativeInput {
  mediaRef?: string;
  headline: string;
  primaryText: string;
  status: "draft" | "approved" | "live";
}

// Logs a new draft creative for this tenant's Ad Library tracker, then
// invalidates the creatives query so the new row shows up immediately.
export function useCreateAdCreative(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAdCreativeInput) =>
      api<{ creative: AdCreative }>(`/api/admin/clients/${tenantId}/ads/creatives`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["admin", "clients", tenantId, "ads", "creatives"],
      });
    },
  });
}

// Command home's agency KPI row (active clients, combined spend).
export function useAdminOverviewQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "overview"],
    enabled,
    staleTime: 60_000,
    queryFn: getAdminOverview,
  });
}

// Theory-of-Constraints rows for the Command home + pillar pages. May resolve
// to an empty array until the pillar_constraints migration is applied.
export function useConstraintsQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "constraints"],
    enabled,
    staleTime: 60_000,
    queryFn: getConstraints,
  });
}

// Persists an edited constraint (Task 4.2's in-app editor) and invalidates
// useConstraintsQuery's key on success, so Command, every pillar page, and
// the delivery overview all re-render with the new copy the next time they
// read the cache.
export function useSaveConstraintMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Omit<PillarConstraint, "updatedAt">) => saveConstraint(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "constraints"] });
    },
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

// Update the caller's real details on a GHL contact (Call Console: capturing
// name/email/ZIP for an unknown inbound caller). Only the provided fields are
// sent, so a partial capture never blanks existing GHL data.
export function useUpsertContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      contactId: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      postalCode?: string;
      source?: string;
    }) =>
      api<{ ok: true }>(`/api/contacts/${input.contactId}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
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
      api<ApiTransactionsResponse>("/api/payments/transactions"),
  });
}

// Jobs (Sales): mark a booked job completed. The server resolves the "Job
// Completed" stage by name and moves the opportunity, so the client sends no
// stage id. Optimistically flips the job to completed in the cache (a fresh
// array, so the calendar dot + month summary both recompute at once), rolls back
// on error, and refetches on settle.
export function useCompleteJob() {
  const qc = useQueryClient();
  const key = ["sales-jobs"];
  return useMutation({
    mutationFn: (input: { jobId: string }) =>
      api<{ ok: boolean; status?: string }>(
        `/api/sales/jobs/${input.jobId}/complete`,
        { method: "POST" },
      ),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<{ jobs: Job[]; configError?: string }>(key);
      if (previous) {
        qc.setQueryData(key, {
          ...previous,
          jobs: previous.jobs.map((j) =>
            j.id === input.jobId ? { ...j, status: "completed" as const } : j,
          ),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
    },
  });
}

// Leads worklist stage write: the off-ramp ("Not a fit" -> status lost) and,
// later, the manual Confirm (a named stage move resolved server-side). The
// server owns stage-name resolution; the client passes a status and/or a stage
// name. Invalidates the merged leads feed so the status pill settles.
export function useMoveSalesLeadStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      leadId: string;
      status?: "open" | "won" | "lost" | "abandoned";
      stageName?: string;
      // Cross-pipeline move (e.g. the Call Console's "Booked the job" outcome,
      // which lands in Sales Pipeline regardless of where the lead started).
      pipelineName?: string;
      // Captured price on a "Booked the job" outcome.
      monetaryValue?: number;
    }) =>
      api<{ ok: boolean }>(`/api/sales/leads/${input.leadId}/stage`, {
        method: "POST",
        body: JSON.stringify({
          status: input.status,
          stageName: input.stageName,
          pipelineName: input.pipelineName,
          monetaryValue: input.monetaryValue,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-leads"] });
    },
  });
}

// Create a brand-new opportunity for an existing contact: the path for an
// unknown inbound caller (a bare GHL contact with no opportunity yet) once a
// terminal call outcome needs a pipeline stage to land in. Pipeline + stage
// resolve BY NAME server-side. Invalidates the same merged leads feed key
// useLeadsHub reads so the new lead shows up on the next read.
export function useCreateSalesLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      contactId: string;
      pipelineName: string;
      stageName: string;
      name: string;
      monetaryValue?: number;
      status?: "open" | "won" | "lost" | "abandoned";
    }) =>
      api<{ ok: true; id: string }>(`/api/sales/leads`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-leads"] });
    },
  });
}

// ===== Appointments (book / reschedule) =====

export interface SlotDay {
  date: string; // "YYYY-MM-DD"
  slots: string[]; // ISO start times with offset, e.g. "2026-07-08T12:00:00-04:00"
}
export interface SlotsResponse {
  ok: true;
  timezone: string;
  days: SlotDay[];
}

// Available booking slots for a named calendar. Only fetched while the picker is
// open (enabled), and never retried on a 422 (calendar-not-found / needs-staff
// are permanent for this call, not transient), so the modal can show an honest
// message instead of spinning. The ApiError body carries { error } so the caller
// can branch on "needs_staff" vs "calendar_not_found".
export function useFreeSlots(calendarName: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["appointments", "slots", calendarName],
    enabled: enabled && !!calendarName,
    staleTime: 60_000,
    retry: false,
    queryFn: () =>
      api<SlotsResponse>(
        `/api/appointments/slots?calendarName=${encodeURIComponent(calendarName ?? "")}`,
      ),
  });
}

// Book an appointment on a named calendar. Invalidates the calendar + jobs +
// leads feeds so a new booking shows on the next read. Non-retrying (POST).
export function useCreateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      contactId: string;
      calendarName: string;
      startTime: string;
      endTime: string;
      title?: string;
    }) =>
      api<{ ok: boolean; id?: string }>(`/api/appointments`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar", "events"] });
      qc.invalidateQueries({ queryKey: ["sales-jobs"] });
      qc.invalidateQueries({ queryKey: ["sales-leads"] });
    },
  });
}

// Reschedule an existing appointment (PUT, idempotent).
export function useRescheduleAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { eventId: string; startTime: string; endTime: string }) =>
      api<{ ok: boolean }>(`/api/appointments/${input.eventId}`, {
        method: "PUT",
        body: JSON.stringify({
          startTime: input.startTime,
          endTime: input.endTime,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar", "events"] });
      qc.invalidateQueries({ queryKey: ["sales-jobs"] });
    },
  });
}

// Jobs: mark a completed job paid. Willis has no GHL invoices, so the server
// records the payment as a contact note (honest, durable) and returns paid:true.
// Optimistically flips the job's `paid` flag (fresh array so the dot recolours),
// rolls back on error, refetches on settle.
export function useMarkJobPaid() {
  const qc = useQueryClient();
  const key = ["sales-jobs"];
  return useMutation({
    mutationFn: (input: { jobId: string; contactId: string; amount?: number }) =>
      api<{ ok: boolean; paid?: boolean }>(
        `/api/sales/jobs/${input.jobId}/payment`,
        {
          method: "POST",
          body: JSON.stringify({ contactId: input.contactId, amount: input.amount }),
        },
      ),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<{ jobs: Job[]; configError?: string }>(key);
      if (previous) {
        qc.setQueryData(key, {
          ...previous,
          jobs: previous.jobs.map((j) =>
            j.id === input.jobId ? { ...j, paid: true } : j,
          ),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
    },
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
