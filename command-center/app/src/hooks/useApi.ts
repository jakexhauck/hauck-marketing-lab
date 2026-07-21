import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import {
  api,
  getAdminOverview,
  getBusinessHealth,
  getConstraints,
  saveBusinessHealth,
  saveConstraint,
  getScalingCalculator,
  saveScalingCalculator,
  getTimeAuditWeek,
  tagTimeAuditBlock,
  type TimeAuditTagBody,
  type TimeAuditWeekResponse,
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
  type AdminClientBillingPatch,
  type AdminClientBillingResponse,
  type AdTrackerLevel,
  type AdTrackerRange,
  type AdTrackerResponse,
  type ApiReviewsResponse,
  type PillarConstraint,
  getSalesData,
  saveSalesDataDay,
  type SalesDataRow,
  type SalesDataPatch,
  type ApiSetterPipelinesResponse,
  type ApiSetterLead,
  type ApiSetterLeadsResponse,
  type ApiSetterLeadDetail,
  type ApiSetterDial,
  type ApiSetterCalendar,
  type ApiSetterEventsResponse,
  type ApiSetterBusy,
  type ApiSetterContact,
  type ApiSetterInboxResponse,
  type ApiSetterThreadResponse,
  type ApiAuditResponse,
} from "../lib/api";
import {
  buildOptimisticDial,
  prependOptimisticDial,
  bumpLeadForDial,
  OPTIMISTIC_DIAL_PREFIX,
  type OptimisticDialInput,
} from "../lib/setterCockpit";
import type { BusinessHealthInputs, PeriodType } from "../lib/businessHealth";
import {
  type CustomersResponse,
  type CustomerDetailResponse,
  type CustomerJobInput,
  type ServicePlanInput,
} from "../lib/customers";
import {
  type CloseOutPrefill,
  type CloseOutRequest,
  type CloseOutSuccess,
  type CloseOutCountResponse,
} from "../lib/closeOut";
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
    // Switching Leads tabs (Sales <-> Trash) changes pipelineId, and so the
    // query key. Keep the previous board on screen while the new pipeline loads
    // instead of collapsing to a spinner, so the layout never jumps on a tab
    // switch.
    placeholderData: keepPreviousData,
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

// The Customers page: the GHL Customers pipeline joined to our job history.
export function useCustomersQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["customers"],
    enabled,
    staleTime: 30_000,
    queryFn: () => api<CustomersResponse>("/api/sales/customers"),
  });
}

// Jobs sitting in Job Completed with no logged job: the red badge on the board,
// the sidebar count and the Home banner all read this one query.
export function useCloseOutCountQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["close-outs", "count"],
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: () => api<CloseOutCountResponse>("/api/sales/close-outs/count"),
  });
}

export function useCloseOutPrefillQuery(opportunityId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["close-outs", "prefill", opportunityId],
    enabled: enabled && Boolean(opportunityId),
    retry: false,
    queryFn: () => api<CloseOutPrefill>(`/api/sales/close-outs/${opportunityId}`),
  });
}

export function useCustomerDetailQuery(contactId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["customers", contactId],
    enabled: enabled && Boolean(contactId),
    retry: false,
    queryFn: () => api<CustomerDetailResponse>(`/api/customers/${contactId}`),
  });
}

// Every customer-detail write invalidates the same two keys: the customer being
// edited, and the Customers list whose tiles are derived from these rows.
function useCustomerMutation<TArgs>(
  contactId: string,
  run: (args: TArgs) => Promise<unknown>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["customers"] });
      void qc.invalidateQueries({ queryKey: ["customers", contactId] });
      // Deleting a job clears its ledger entry, so a board card can become
      // eligible for close-out again.
      void qc.invalidateQueries({ queryKey: ["close-outs"] });
    },
  });
}

export function useAddCustomerJob(contactId: string) {
  return useCustomerMutation(contactId, (body: CustomerJobInput) =>
    api(`/api/customers/${contactId}/jobs`, { method: "POST", body: JSON.stringify(body) }),
  );
}

export function useEditCustomerJob(contactId: string) {
  return useCustomerMutation(contactId, ({ jobId, ...body }: CustomerJobInput & { jobId: string }) =>
    api(`/api/customers/${contactId}/jobs/${jobId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  );
}

export function useDeleteCustomerJob(contactId: string) {
  return useCustomerMutation(contactId, (jobId: string) =>
    api(`/api/customers/${contactId}/jobs/${jobId}`, { method: "DELETE" }),
  );
}

export function useSetServicePlan(contactId: string) {
  return useCustomerMutation(contactId, (body: ServicePlanInput) =>
    api<{ ok: true; calendarError?: string }>(`/api/customers/${contactId}/plan`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  );
}

export function useCloseOutJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CloseOutRequest) =>
      api<CloseOutSuccess>("/api/sales/close-outs", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      // The board loses a card, Customers gains one, and the nudges must stop.
      void qc.invalidateQueries({ queryKey: ["customers"] });
      void qc.invalidateQueries({ queryKey: ["close-outs"] });
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["summary"] });
    },
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

// Setter Suite: every pipeline and stage for the selected client, resolved
// live and unfiltered (unlike the client-facing PipelinesContext, nothing is
// hidden here). Feeds the pipeline tab strip on /admin/setter.
export function useSetterPipelinesQuery(tenantId: string, enabled = true) {
  return useQuery({
    queryKey: ["admin", "setter", "pipelines", tenantId],
    enabled: enabled && !!tenantId,
    staleTime: 30_000,
    queryFn: () =>
      api<ApiSetterPipelinesResponse>(
        `/api/admin/setter/pipelines?tenantId=${encodeURIComponent(tenantId)}`,
      ),
  });
}

// Setter Suite: every open lead in one pipeline, merged with its dial
// history. Re-fetched per pipeline tab rather than once for all 8, so
// switching tabs never fires 8 requests up front.
export function useSetterLeadsQuery(tenantId: string, pipelineId: string, enabled = true) {
  return useQuery({
    queryKey: ["admin", "setter", "leads", tenantId, pipelineId],
    enabled: enabled && !!tenantId && !!pipelineId,
    staleTime: 15_000,
    queryFn: () =>
      api<ApiSetterLeadsResponse>(
        `/api/admin/setter/leads?tenantId=${encodeURIComponent(tenantId)}&pipelineId=${encodeURIComponent(pipelineId)}`,
      ),
  });
}

// Setter Suite cockpit: one contact's live name/phone/email/tags plus its
// full dial history, newest first. Powers the panel docked beside the
// board (src/components/admin/setter/SetterCockpit.tsx).
export function useSetterLeadDetailQuery(
  tenantId: string,
  contactId: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: ["admin", "setter", "lead", tenantId, contactId],
    enabled: enabled && !!tenantId && !!contactId,
    staleTime: 10_000,
    queryFn: () =>
      api<{ lead: ApiSetterLeadDetail }>(
        `/api/admin/setter/lead/${encodeURIComponent(contactId ?? "")}?tenantId=${encodeURIComponent(tenantId)}`,
      ),
  });
}

export interface LogSetterDialInput extends OptimisticDialInput {
  tenantId: string;
  // Client-side only, never sent to the API: locates the board's cached
  // leads list (["admin","setter","leads",tenantId,pipelineId]) so the
  // matching card can be bumped optimistically. leadId is the opportunity
  // id, ApiSetterLead.id, used to find the right card in that list.
  pipelineId: string;
  leadId: string;
}

// Logs one dial (POST /api/admin/setter/dials). Optimistic on both caches it
// feeds: the lead detail's timeline (a dial appears immediately, newest
// first, src/lib/setterCockpit.ts:prependOptimisticDial) and the board's
// card (attempts/contacted/lastOutcome bump the same way the server's own
// functions/lib/setterMetrics.ts:rollUpByContact would once the real row
// lands, via bumpLeadForDial). Rolled back to the exact previous snapshot on
// failure, never a partial patch, so a failed write can never leave a
// phantom dial or an inflated attempt count on screen: the attempt count is
// the setter's real contact-rate metric.
export function useLogSetterDial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LogSetterDialInput) =>
      api<{ dial: ApiSetterDial }>("/api/admin/setter/dials", {
        method: "POST",
        body: JSON.stringify({
          tenantId: input.tenantId,
          contactId: input.contactId,
          opportunityId: input.opportunityId ?? null,
          pipelineName: input.pipelineName ?? null,
          stageName: input.stageName ?? null,
          spoke: input.spoke,
          outcome: input.outcome,
          note: input.note ?? null,
          tagsApplied: input.tagsApplied ?? [],
        }),
      }),
    onMutate: async (input) => {
      const detailKey = ["admin", "setter", "lead", input.tenantId, input.contactId] as const;
      const listKey = ["admin", "setter", "leads", input.tenantId, input.pipelineId] as const;
      await Promise.all([
        qc.cancelQueries({ queryKey: detailKey }),
        qc.cancelQueries({ queryKey: listKey }),
      ]);

      const previousDetail = qc.getQueryData<{ lead: ApiSetterLeadDetail }>(detailKey);
      const previousList = qc.getQueryData<ApiSetterLeadsResponse>(listKey);

      const tempId = `${OPTIMISTIC_DIAL_PREFIX}${Date.now()}`;
      const nowIso = new Date().toISOString();
      const optimisticDial = buildOptimisticDial(input, nowIso, tempId);

      if (previousDetail) {
        qc.setQueryData(detailKey, {
          lead: {
            ...previousDetail.lead,
            dials: prependOptimisticDial(previousDetail.lead.dials, optimisticDial),
          },
        });
      }
      if (previousList) {
        qc.setQueryData(listKey, {
          ...previousList,
          leads: previousList.leads.map((l: ApiSetterLead) =>
            l.id === input.leadId ? bumpLeadForDial(l, optimisticDial) : l,
          ),
        });
      }

      return { previousDetail, previousList, detailKey, listKey };
    },
    onError: (_err, _input, context) => {
      if (context?.previousDetail) qc.setQueryData(context.detailKey, context.previousDetail);
      if (context?.previousList) qc.setQueryData(context.listKey, context.previousList);
    },
    onSettled: (_data, _err, input) => {
      qc.invalidateQueries({ queryKey: ["admin", "setter", "lead", input.tenantId, input.contactId] });
      qc.invalidateQueries({ queryKey: ["admin", "setter", "leads", input.tenantId, input.pipelineId] });
    },
  });
}

export interface SetterTagsInput {
  tenantId: string;
  contactId: string;
  add?: string[];
  remove?: string[];
}

// Adds/removes tags on the live CRM contact (POST /api/admin/setter/tags),
// then writes the RESPONSE's tag list into the lead detail cache: the API
// re-reads the contact after writing rather than echoing the request
// (functions/api/admin/setter/tags.ts), and this does the same on the
// client, so the cockpit only ever shows what the CRM actually holds, never
// an optimistic guess, since these tags fire live automations.
//
// The endpoint applies removes then adds as two separate CRM calls, so a
// request that dies partway through (remove succeeded, add threw) already
// changed the CRM's real tag list before the caller ever sees an error. An
// onSuccess-only cache write would leave the panel showing the pre-write
// tags, including one that no longer exists, on that failure path. onSettled
// re-reads the lead detail query unconditionally, so the panel always ends
// up showing the CRM's true state, success or failure alike.
export function useSetterTagsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SetterTagsInput) =>
      api<{ tags: string[] }>("/api/admin/setter/tags", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (data, input) => {
      const detailKey = ["admin", "setter", "lead", input.tenantId, input.contactId];
      const previous = qc.getQueryData<{ lead: ApiSetterLeadDetail }>(detailKey);
      if (previous) {
        qc.setQueryData(detailKey, { lead: { ...previous.lead, tags: data.tags } });
      }
    },
    onSettled: (_data, _err, input) => {
      qc.invalidateQueries({ queryKey: ["admin", "setter", "lead", input.tenantId, input.contactId] });
    },
  });
}

export interface SetterTaskInput {
  tenantId: string;
  contactId: string;
  title: string;
  dueDate?: string;
}

// Creates a follow-up task on the live CRM contact in the client's own
// sub-account (POST /api/admin/setter/task). Used by the Follow Up cockpit
// action, which applies its tag and then prompts for the task.
export function useCreateSetterTask() {
  return useMutation({
    mutationFn: (input: SetterTaskInput) =>
      api<{ task: ApiTask | null }>("/api/admin/setter/task", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  });
}

export interface SetterSlotDay {
  date: string; // "YYYY-MM-DD"
  slots: string[]; // ISO start times with offset
}
export interface SetterSlotsResponse {
  ok: true;
  timezone: string;
  days: SetterSlotDay[];
}

// Every bookable calendar for the selected client (GET
// /api/admin/setter/calendars). Feeds the booking panel's calendar picker.
// Cached hard: calendars are effectively static within a session, so
// refetching them on every cockpit open would burn a live CRM call for a
// list that will not have changed.
export function useSetterCalendarsQuery(tenantId: string, enabled = true) {
  return useQuery({
    queryKey: ["admin", "setter", "calendars", tenantId],
    enabled: enabled && !!tenantId,
    staleTime: 5 * 60_000,
    queryFn: () =>
      api<{ calendars: ApiSetterCalendar[] }>(
        `/api/admin/setter/calendars?tenantId=${encodeURIComponent(tenantId)}`,
      ),
  });
}

// Live free-slot lookup for the cockpit's booking section (GET
// /api/admin/setter/slots). Takes a calendar ID picked from the list above,
// NOT a name: the endpoint stopped resolving names once a real list existed,
// and a name lookup in the middle was a lossy round trip. Never retried: a
// 422 (calendar_not_found / needs_staff) is permanent for this call, not
// transient, so the panel can show an honest message instead of spinning.
export function useSetterSlotsQuery(
  tenantId: string,
  calendarId: string,
  days: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["admin", "setter", "slots", tenantId, calendarId, days],
    enabled: enabled && !!tenantId && !!calendarId.trim(),
    staleTime: 30_000,
    retry: false,
    queryFn: () =>
      api<SetterSlotsResponse>(
        `/api/admin/setter/slots?tenantId=${encodeURIComponent(tenantId)}&calendarId=${encodeURIComponent(calendarId)}&days=${days}`,
      ),
  });
}

export interface SetterBookInput {
  tenantId: string;
  calendarId: string;
  contactId: string;
  startTime: string;
  endTime: string;
  title?: string;
}

// Books a real appointment (POST /api/admin/setter/book). Deliberately
// never retried: a retried POST here can double-book a real customer into a
// real calendar (see functions/api/admin/setter/book.ts's header comment).
// The default mutation retry is already 0 (src/lib/queryClient.ts), but this
// stays explicit since it is a hard requirement, not an incidental default.
// The caller (SlotPicker) must also disable its Book button while
// isPending, so a double-click cannot fire the mutate function twice.
export function useSetterBookMutation() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: (input: SetterBookInput) =>
      api<{ ok: boolean; id?: string }>("/api/admin/setter/book", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ["admin", "setter", "leads", input.tenantId] });
      qc.invalidateQueries({ queryKey: ["calendar", "events"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Setter Suite calendar
//
// TWO OF THESE THREE USE A DELIBERATE KEY STEM. Booked events and contact
// search carry customer names, phones and emails, so they key off
// "setter-events" and "setter-contacts", which src/lib/queryClient.ts refuses
// to persist. Matching there is EXACT per key element, so the plain "setter"
// stem the rest of the Suite uses would have written a client's customers to
// a setter's localStorage. Busy keeps the ordinary stem: it is bare start/end
// intervals with no titles or attendees, nothing that identifies anyone.
// Renaming either stem silently re-enables that persistence.
// ---------------------------------------------------------------------------

// Booked appointments across every active calendar for the selected client
// (GET /api/admin/setter/events). The range is a week of the grid, capped
// server-side at 62 days, so a setter paging through weeks cannot fan out
// hundreds of CRM calls per calendar.
export function useSetterEventsQuery(
  tenantId: string,
  startIso: string,
  endIso: string,
  enabled = true,
) {
  return useQuery({
    queryKey: ["admin", "setter-events", tenantId, startIso, endIso],
    enabled: enabled && !!tenantId && !!startIso && !!endIso,
    staleTime: 30_000,
    queryFn: () =>
      api<ApiSetterEventsResponse>(
        `/api/admin/setter/events?tenantId=${encodeURIComponent(tenantId)}&start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`,
      ),
  });
}

// The client's Google Calendar busy hours for the same range (GET
// /api/admin/setter/busy). Cached longer than the events above because the
// route is brokered through Composio, whose managed auth shares a rate limit
// across all of its customers. Never retried: the endpoint answers a missing
// or expired calendar link with `connected: false`, not an error, so anything
// that does reach here as a failure is real and will not heal on a repeat.
export function useSetterBusyQuery(
  tenantId: string,
  startIso: string,
  endIso: string,
  enabled = true,
) {
  return useQuery({
    queryKey: ["admin", "setter", "busy", tenantId, startIso, endIso],
    enabled: enabled && !!tenantId && !!startIso && !!endIso,
    staleTime: 60_000,
    retry: false,
    queryFn: () =>
      api<ApiSetterBusy>(
        `/api/admin/setter/busy?tenantId=${encodeURIComponent(tenantId)}&start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`,
      ),
  });
}

// Existing-contact search for the booking panel (GET
// /api/admin/setter/contacts). The two-character floor matches the endpoint's
// own MIN_QUERY, so a shorter term stays disabled here rather than spending a
// round trip to be told 400. Never retried: this fires per keystroke and a
// retry queue behind a typing setter is worse than one honest failure.
export function useSetterContactSearchQuery(
  tenantId: string,
  q: string,
  enabled = true,
) {
  return useQuery({
    queryKey: ["admin", "setter-contacts", tenantId, q],
    enabled: enabled && !!tenantId && q.trim().length >= 2,
    staleTime: 30_000,
    retry: false,
    queryFn: () =>
      api<{ contacts: ApiSetterContact[] }>(
        `/api/admin/setter/contacts?tenantId=${encodeURIComponent(tenantId)}&q=${encodeURIComponent(q.trim())}`,
      ),
  });
}

// ---------------------------------------------------------------------------
// Setter Suite inbox
//
// KEY STEM IS DELIBERATE. These use "setter-inbox", not the "setter" stem the
// rest of the Suite uses, because src/lib/queryClient.ts refuses to persist any
// query whose key CONTAINS the string "setter-inbox". These answers are a
// client's customer correspondence and must never reach localStorage, where
// they would sit on a setter's disk until the cache buster moved. Renaming
// this stem silently re-enables that persistence.
// ---------------------------------------------------------------------------

// The client's inbox, as a GROWING WINDOW from the top rather than a walked
// offset. `limit` is the whole window: "load more" asks for a bigger one and
// replaces the list, it does not append a page.
//
// This is deliberate and it is a correctness requirement, not a style choice.
// The underlying list re-sorts by recency on every request, so an offset does
// not address a stable row. Page 1 returns rows 0 to 49; a thread then gets a
// new inbound message and jumps to index 0; every row shifts down one; the
// request for offset 50 now starts one row later and the row that crossed the
// boundary is never returned at all. It is silently missing until a reload, and
// it is precisely the thread with fresh customer activity. Re-reading from the
// top makes that impossible.
//
// `q` filters server-side, so a setter searches the whole inbox rather than
// only the window they happen to be holding.
export function useSetterInboxQuery(
  tenantId: string,
  q: string,
  limit: number,
  enabled = true,
) {
  return useQuery({
    queryKey: ["admin", "setter-inbox", "threads", tenantId, q, limit],
    enabled: enabled && !!tenantId,
    staleTime: 15_000,
    queryFn: () => {
      const p = new URLSearchParams({ tenantId, limit: String(limit) });
      if (q.trim()) p.set("q", q.trim());
      return api<ApiSetterInboxResponse>(`/api/admin/setter/inbox?${p.toString()}`);
    },
  });
}

// One contact's full thread, newest last.
export function useSetterThreadQuery(
  tenantId: string,
  contactId: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: ["admin", "setter-inbox", "thread", tenantId, contactId],
    enabled: enabled && !!tenantId && !!contactId,
    staleTime: 10_000,
    queryFn: () =>
      api<ApiSetterThreadResponse>(
        `/api/admin/setter/inbox/${encodeURIComponent(contactId ?? "")}?tenantId=${encodeURIComponent(tenantId)}`,
      ),
  });
}

export interface SetterSendInput {
  tenantId: string;
  contactId: string;
  channel: string;
  body: string;
  subject?: string;
}

// Sends a REAL message to a REAL customer under the client's name. There is no
// undo and no approval step. Never retried: a retried POST here sends the
// message twice, and a duplicate text from a business reads as a malfunction.
// The composer must also disable its send control while isPending.
//
// Invalidates on settle rather than on success: a send that reports failure may
// still have gone out (the failure can be in our response path, not GHL's
// delivery), so the thread must be refetched either way or the setter is shown
// a thread that disagrees with what the customer received.
export function useSetterSendMutation() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: (input: SetterSendInput) =>
      // `audited` false means the message WENT OUT but no audit row landed. The
      // caller must surface that rather than showing a plain success.
      api<{ sent: boolean; messageId?: string; audited: boolean }>(
        `/api/admin/setter/inbox/${encodeURIComponent(input.contactId)}`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSettled: (_d, _e, input) => {
      qc.invalidateQueries({
        queryKey: ["admin", "setter-inbox", "thread", input.tenantId, input.contactId],
      });
      qc.invalidateQueries({ queryKey: ["admin", "setter-inbox", "threads", input.tenantId] });
    },
  });
}

// The admin audit log (GET /api/admin/audit), newest first. Filterable by
// tenant and action so "setter.send" can be isolated.
export function useAdminAuditQuery(
  opts: { limit?: number; offset?: number; tenantId?: string; action?: string },
  enabled = true,
) {
  const { limit = 50, offset = 0, tenantId, action } = opts;
  return useQuery({
    queryKey: ["admin", "audit", limit, offset, tenantId ?? null, action ?? null],
    enabled,
    staleTime: 15_000,
    queryFn: () => {
      const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (tenantId) p.set("tenantId", tenantId);
      if (action) p.set("action", action);
      return api<ApiAuditResponse>(`/api/admin/audit?${p.toString()}`);
    },
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

// One client's billing record for the Fulfillment cockpit's Billing tab, from
// GET /api/admin/clients/:tenantId/billing. A client that has never been saved
// returns the empty record (blank fields, zero cash), not fabricated numbers.
export function useAdminClientBillingQuery(tenantId: string, enabled = true) {
  return useQuery({
    queryKey: ["admin", "clients", tenantId, "billing"],
    enabled: enabled && !!tenantId,
    staleTime: 30_000,
    queryFn: () =>
      api<AdminClientBillingResponse>(`/api/admin/clients/${tenantId}/billing`),
  });
}

// Saves the whole billing record (PATCH upserts by tenant_id, creating the row
// on the first save). The tab is one logical record with a single Save button,
// so this sends the full form rather than per-field patches. The response
// carries the saved record back, so seed the cache with it instead of
// refetching what we were just handed.
export function useAdminClientBillingSave(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: AdminClientBillingPatch) =>
      api<{ ok: true } & AdminClientBillingResponse>(
        `/api/admin/clients/${tenantId}/billing`,
        { method: "PATCH", body: JSON.stringify(patch) },
      ),
    onSuccess: (data) => {
      qc.setQueryData<AdminClientBillingResponse>(
        ["admin", "clients", tenantId, "billing"],
        { billing: data.billing },
      );
    },
  });
}

// One month of a client's paid-ad funnel tracker for the Fulfillment cockpit's
// Paid Ads > Ad Tracking sub-tab. Keyed by tenant AND month so switching months
// swaps cache entries instead of refetching over the same key.
// The rebuilt Ad Tracker. keepPreviousData so flipping range or pivot level
// swaps the numbers without blanking the table first.
export function useAdminAdTrackerQuery(
  tenantId: string,
  range: AdTrackerRange,
  level: AdTrackerLevel,
) {
  return useQuery({
    queryKey: ["admin", "ad-tracker", tenantId, range, level],
    enabled: !!tenantId,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
    queryFn: () =>
      api<AdTrackerResponse>(
        `/api/admin/clients/${tenantId}/ad-tracker?range=${range}&level=${level}`,
      ),
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

// One client's Website > Pages list (the manual per-client list on the tenant
// row) for the Fulfillment cockpit's Web Design > Pages panel, from GET
// /api/admin/clients/:tenantId/website/pages. The panel joins each path onto the
// client's website_url to preview, and edits the list via useSaveAdminWebsitePages.
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

// A page as the admin editor edits it (no id: the server keys by path). Saving
// replaces the whole list.
export interface WebsitePageEdit {
  name: string;
  path: string;
}

// Saves the client's Website > Pages list (PUT). On success the admin panel and
// the client's own Pages tab both reflect it: invalidate the admin pages query
// here; the client tab refetches on its own staleTime / next mount.
export function useSaveAdminWebsitePages(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pages: WebsitePageEdit[]) =>
      api<{ ok: true; pages: WebsitePageItem[] }>(
        `/api/admin/clients/${tenantId}/website/pages`,
        { method: "PUT", body: JSON.stringify({ pages }) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["admin", "clients", tenantId, "website", "pages"],
      });
    },
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

// Business Health, one query per period key. Switching the period toggle
// changes the key, so each period keeps its own cache entry and nothing bleeds
// across periods.
export function useBusinessHealthQuery(period: string, enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "tracker", "business-health", period],
    enabled: enabled && !!period,
    staleTime: 60_000,
    queryFn: () => getBusinessHealth(period),
  });
}

// Autosave for a single period row. The response is the freshly-read row, so
// seeding the cache with it (rather than invalidating) reconciles the local
// inputs against what the server actually stored without a refetch round-trip
// that would fight the field the user is still typing in.
export function useSaveBusinessHealthMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      period: string;
      periodType: PeriodType;
      inputs: Partial<BusinessHealthInputs>;
    }) => saveBusinessHealth(v.period, v.periodType, v.inputs),
    onSuccess: (res) => {
      qc.setQueryData(["admin", "tracker", "business-health", res.period], res);
    },
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

// The agency's own Sales Data tracker (Sales pillar). Keyed by month, so
// stepping through the month nav caches each month independently instead of
// refetching the same one on every step back.
export function useSalesDataQuery(month: string) {
  return useQuery({
    queryKey: ["admin", "tracker", "sales-data", month],
    enabled: !!month,
    staleTime: 30_000,
    // The month nav should not blank the table while the next month loads.
    placeholderData: keepPreviousData,
    queryFn: () => getSalesData(month),
  });
}

export interface SaveSalesDataInput {
  day: string; // "YYYY-MM-DD"
  patch: SalesDataPatch;
}

// Saves one day, optimistically. Typing in a tracker cell has to feel like a
// spreadsheet, so the cached month is patched immediately and rolled back if the
// write fails; the refetch on settle is what reconciles with the server's own
// coercion (a typed "9.7" comes back as 9).
export function useSaveSalesDataDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ day, patch }: SaveSalesDataInput) => saveSalesDataDay(day, patch),
    onMutate: async ({ day, patch }) => {
      // The month a day belongs to is in the day itself, so the mutation needs
      // no separate month argument to find the right cache entry.
      const key = ["admin", "tracker", "sales-data", day.slice(0, 7)];
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<SalesDataRow[]>(key);
      if (previous) {
        const existing = previous.find((r) => r.day === day);
        qc.setQueryData<SalesDataRow[]>(
          key,
          existing
            ? previous.map((r) => (r.day === day ? { ...r, ...patch } : r))
            : // First edit of an unlogged day: it has no row yet, so add one
              // rather than drop the keystroke on the floor.
              [
                ...previous,
                {
                  day,
                  callsOnCalendar: null,
                  rescheduledCancelled: null,
                  callsTaken: null,
                  qualified: null,
                  closed: null,
                  cashCollected: null,
                  notes: null,
                  ...patch,
                },
              ].sort((a, b) => a.day.localeCompare(b.day)),
        );
      }
      return { key, previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(context.key, context.previous);
    },
    onSettled: (_data, _err, _vars, context) => {
      if (context?.key) qc.invalidateQueries({ queryKey: context.key });
    },
  });
}

// ===== Operations pillar: Scaling Calculator =====
// Persistence is a convenience only. The compute is client-side and live, so a
// failed load still renders the tiles from DEFAULT_INPUTS.
export function useScalingCalculatorQuery(enabled = true) {
  return useQuery({
    queryKey: ["admin", "tracker", "scaling-calculator"],
    enabled,
    staleTime: 60_000,
    queryFn: getScalingCalculator,
  });
}

export function useSaveScalingCalculatorMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveScalingCalculator,
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["admin", "tracker", "scaling-calculator"],
      }),
  });
}

// ===== Operations pillar: Time Audit =====
export function useAdminTimeAuditWeek(weekStart: string) {
  return useQuery({
    queryKey: ["admin", "tracker", "time-audit", weekStart],
    enabled: !!weekStart,
    queryFn: () => getTimeAuditWeek(weekStart),
  });
}

// Optimistic so click-to-cycle feels instant: patch the cached week, roll back
// on error, then reconcile against the server on settle.
export function useAdminTimeAuditTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: tagTimeAuditBlock,
    onMutate: async (body: TimeAuditTagBody) => {
      const key = ["admin", "tracker", "time-audit", body.weekStart];
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<TimeAuditWeekResponse>(key);
      qc.setQueryData<TimeAuditWeekResponse>(key, (old) => {
        if (!old) return old;
        const rest = old.blocks.filter(
          (b) => !(b.dayOfWeek === body.dayOfWeek && b.slot === body.slot),
        );
        // taskType null means the cell was cycled back to empty, which deletes
        // the row rather than storing a null tag.
        if (body.taskType === null) return { ...old, blocks: rest };
        return {
          ...old,
          blocks: [
            ...rest,
            {
              dayOfWeek: body.dayOfWeek,
              slot: body.slot,
              leverage: body.leverage,
              taskType: body.taskType,
            },
          ],
        };
      });
      return { key, previous };
    },
    onError: (_err, _body, ctx) => {
      if (ctx?.previous) qc.setQueryData(ctx.key, ctx.previous);
    },
    onSettled: (_data, _err, body) =>
      qc.invalidateQueries({
        queryKey: ["admin", "tracker", "time-audit", body.weekStart],
      }),
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

// --- Google Calendar link (client-owned) -----------------------------------
// The client links their OWN Google Calendar from the Jobs page so the calendar
// can grey out hours they are already busy. The agency never handles the token:
// Composio brokers the grant, keyed by the tenant. Availability only, no event
// detail is ever requested.

// Not linked is a normal state, never an error, so callers read `connected`
// rather than branching on failure.
export function useGoogleCalendarConnection() {
  return useQuery({
    queryKey: ["connections", "google-calendar"],
    staleTime: 30_000,
    queryFn: () =>
      api<{ connected: boolean; status: string }>("/api/connections/google-calendar"),
  });
}

export function useStartGoogleCalendarConnect() {
  return useMutation({
    mutationFn: () =>
      api<{ redirectUrl: string }>("/api/connections/google-calendar/start", {
        method: "POST",
      }),
  });
}

export function useUnlinkGoogleCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{ ok: boolean }>("/api/connections/google-calendar", { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["connections", "google-calendar"] });
      qc.invalidateQueries({ queryKey: ["calendar", "busy"] });
    },
  });
}

// Busy intervals for the dates currently on screen. The browser's own zone is
// sent so Google returns wall-clock times matching what the viewer sees;
// without it every block lands hours off.
export function useCalendarBusy(startIso: string, endIso: string, enabled: boolean) {
  const tz = calendarTimezone();
  return useQuery({
    queryKey: ["calendar", "busy", startIso, endIso, tz],
    enabled: enabled && Boolean(startIso && endIso),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: () =>
      api<{ connected: boolean; busy: { start: string; end: string }[] }>(
        `/api/calendar/busy?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(
          endIso,
        )}&tz=${encodeURIComponent(tz)}`,
      ),
  });
}

function calendarTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

// A short-lived read-only preview token for framing one client's live app inside
// the admin Fulfillment "Software" tab. POSTs to a route that returns the token
// in the body and sets NO cookie, so the admin's own session is untouched.
//
// Refetched at 80% of its life so a long browse never hits an expired frame.
export function useClientPreviewToken(tenantId: string, enabled = true) {
  return useQuery({
    queryKey: ["admin", "clients", tenantId, "preview-token"],
    enabled: enabled && !!tenantId,
    // The token is the cache entry; refresh it well before the server expires it.
    staleTime: 12 * 60_000,
    refetchInterval: 12 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: () =>
      api<{ token: string; expiresInSeconds: number }>(
        `/api/admin/clients/${tenantId}/preview-token`,
        { method: "POST" },
      ),
  });
}
