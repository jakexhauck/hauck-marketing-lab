import { demoMode } from "../demo/demoMode";
import { handleDemoRequest } from "../demo/handler";
import { previewHeaders } from "./previewFrame";
import type { BusinessHealthInputs, PeriodType } from "./businessHealth";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  // Demo client view: resolve every call against the in-memory fixture store
  // instead of the network, so a demo tab never reads or mutates a real client.
  if (demoMode()) return handleDemoRequest<T>(path, init);

  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  // Inside the admin Software tab's preview frame this carries the read-only
  // preview token, which the server reads ahead of the (admin) cookie the
  // browser also attaches. A no-op in every normal tab.
  for (const [k, v] of Object.entries(previewHeaders())) headers.set(k, v);

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    if (res.status === 401) {
      // Expired/invalid session detected mid-flight. AuthContext listens and
      // flips to unauthenticated so ProtectedRoute returns the user to /login
      // instead of leaving every panel stuck on "Failed to load".
      window.dispatchEvent(new CustomEvent("hml:unauthorized"));
    }
    const msg =
      (body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : null) ?? `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, msg, body);
  }
  return body as T;
}

export interface ApiLeadAttribution {
  source: string;
  campaign: string;
  ad: string;
  adset: string;
}

export interface ApiLead {
  id: string;
  name: string;
  phone: string;
  email: string;
  contactId: string;
  pipelineId: string;
  pipelineStageId: string;
  status: string;
  value: number | null;
  createdAt: string;
  lastActivityAt: string;
  // GHL user id the opportunity is assigned to (opportunity.assignedTo), or
  // null if unassigned. Drives rep-only filtering.
  assignedUserId: string | null;
  // Single-lead endpoint only: UTM attribution + tags from the contact record.
  attribution?: ApiLeadAttribution | null;
  tags?: string[];
}

// Display config for the signed-in tenant from GET /api/tenant. Null when
// Supabase is unconfigured; the app falls back to APP_BRAND.
export interface ApiTenant {
  name: string;
  niche: string;
  brandColor: string;
  brandInitials: string;
  appName: string;
  wonLabel: string;
  valueLabel: string;
  monthlySpend: number | null;
  // The client's live website, or null when none is set. Drives the Website
  // page's real preview + "View live site" button.
  websiteUrl: string | null;
}

export interface ApiPipelineSummary {
  id: string;
  name: string;
  // `color` is the per-stage hex from GHL (e.g. "#F97316") so stages can render
  // in the same colour the client sees in GHL. Optional: older/demo data omits it.
  stages: { id: string; name: string; color?: string }[];
}

export interface PipelineSummary {
  id: string;
  name: string;
  total: number;
  open: number;
}

export interface ApiSummary {
  pipelines: PipelineSummary[];
  newToday: number;
  unreadConversations: number;
}

export interface ApiMessage {
  id: string;
  body: string;
  direction: string;
  type: string;
  at: string;
}

export interface ApiContact {
  id: string;
  name: string;
  phone: string;
  email: string;
  source: string;
  tags: string[];
  createdAt: string;
  lastActivityAt: string;
}

// A completed-job contact on the Google Reviews surface. started = the review
// campaign tag is already on the contact (campaign running), so the button is
// spent. Source of truth is the GHL contact tag; see functions/api/reviews.
export interface ApiReviewContact {
  contactId: string;
  name: string;
  phone: string;
  email: string;
  completedAt: string;
  started: boolean;
}

export interface ApiReviewsResponse {
  contacts: ApiReviewContact[];
  // Set when no Sales / Job Completed stage was found for the tenant; the page
  // shows a quiet note instead of an error.
  configError?: string;
  // When present, "already started" was only computed for the newest N rows.
  truncatedAt?: number;
}

export interface ApiConversation {
  id: string;
  contactId: string;
  name: string;
  preview: string;
  lastMessageType: string;
  lastMessageAt: string;
  unreadCount: number;
  // Unified Inbox: medium of the last message + where the lead came from.
  // Optional so older payloads and demo data without them still type-check;
  // the UI derives channel from lastMessageType and defaults origin to "other".
  channel?: "sms" | "email" | "other";
  origin?: "form" | "chat" | "paid" | "react" | "call" | "other";
  source?: string;
  firstTouchAt?: string;
  // Pipeline position, joined from the lead's GHL opportunity (optional: many
  // conversations have no opportunity yet). stageName drives the inbox grouping.
  pipelineId?: string;
  pipelineStageId?: string;
  pipelineName?: string;
  stageName?: string;
  // Every pipeline the contact sits in. A past customer is in Sales AND Google
  // Reviews at once, so the fields above (one chosen opportunity) cannot answer
  // "where is this contact in the Google Reviews pipeline?" — this can.
  // Optional: absent from payloads cached by a bundle that predates it, so always
  // read it through `convPipelines()` rather than touching it directly.
  pipelines?: ConversationPipeline[];
}

export interface ConversationPipeline {
  pipelineId: string;
  pipelineStageId: string;
  pipelineName: string;
  stageName: string;
  status: string;
}

// The one safe way to read `pipelines`. A payload persisted by an older bundle
// has no such field, and a poisoned localStorage snapshot is what white-screened
// Paid Ads before — so never touch `c.pipelines` directly.
export function convPipelines(c: ApiConversation): ConversationPipeline[] {
  return Array.isArray(c.pipelines) ? c.pipelines : [];
}

export interface ApiNote {
  id: string;
  body: string;
  dateAdded?: string;
  userId?: string;
}

export interface ApiTask {
  id: string;
  title: string;
  body?: string;
  dueDate?: string;
  completed?: boolean;
  assignedTo?: string;
}

export interface ApiInvoice {
  id: string;
  number: string;
  contactName: string;
  total: number;
  status: string;
  dueDate: string | null;
  paidAt: string | null;
}

export interface ApiInvoiceLineItem {
  name: string;
  qty: number;
  amount: number;
}

export interface ApiInvoiceDetail {
  id: string;
  number: string;
  contactName: string;
  status: string;
  total: number;
  amountPaid: number;
  amountDue: number;
  currency: string;
  issueDate: string | null;
  dueDate: string | null;
  paidAt: string | null;
  items: ApiInvoiceLineItem[];
}

export interface ApiTransaction {
  id: string;
  amount: number;
  status: string;
  contactName: string;
  createdAt: string | null;
  method: string;
}

export interface ApiTransactionsResponse {
  transactions: ApiTransaction[];
  total: number;
  // True when GHL reports more transactions than the pagination cap fetched;
  // the UI renders the count as "N+" instead of an exact figure.
  approximate?: boolean;
}

export interface ApiCalendarEvent {
  id: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
  contactId: string;
  contactName: string;
  address: string;
  meetingUrl: string;
  notes: string;
}

export interface ApiActivity {
  id: number;
  action: string;
  lead_id: string | null;
  payload: {
    summary?: string;
    contact_id?: string | null;
    opportunity_id?: string | null;
    raw?: unknown;
  } | null;
  created_at: string;
}

// The notification center reuses the activity shape plus per-row read state
// (read_at: null = unread). The webhook is the single writer of both.
export interface ApiNotification extends ApiActivity {
  read_at: string | null;
}

export interface AdminClient {
  id: string;
  slug: string;
  name: string;
  niche: string;
  brandColor: string;
  brandInitials: string;
  appName: string;
  ghlLocationId: string;
  monthlySpend: number;
  memberCount: number;
  createdAt: string;
  // From migration 0022 (tenants.health_status / health_note): a manual
  // per-subaccount health flag surfaced in the Service Delivery roster rail.
  // 500s at the endpoint until that migration is applied to the live DB.
  healthStatus: "healthy" | "warn" | "paused";
  healthNote: string | null;
}

// The single-client detail (GET /api/admin/clients/:tenantId): everything the
// Service Delivery cockpit's header + Overview tab (Task 3.3) and the Config
// tab render, shared so both read the same cached request instead of each
// fetching their own copy.
export interface AdminClientDetail {
  id: string;
  slug: string;
  name: string;
  niche: string;
  brandColor: string;
  brandInitials: string;
  appName: string;
  wonLabel: string;
  valueLabel: string;
  ghlLocationId: string;
  metaAdAccountId: string | null;
  googlePlaceId: string | null;
  ga4PropertyId: string | null;
  websiteUrl: string | null;
  subdomain: string | null;
  ownerPasswordSet: boolean;
  monthlySpend: number;
  createdAt: string;
  healthStatus: "healthy" | "warn" | "paused";
  healthNote: string | null;
}

export interface AdminClientStaffMember {
  id: string;
  name: string;
  email: string;
  role: "owner" | "manager" | "rep";
  status: string;
  ghlUserId: string | null;
  createdAt: string;
  permissions: { capability: string; view: boolean; edit: boolean }[];
}

// A GHL-identified person on the account (tenant_users), informational only;
// distinct from staff (the login accounts staff_accounts holds).
export interface AdminClientTenantUser {
  name: string;
  email: string;
  role: string;
  ghlUserId: string | null;
}

export interface AdminClientActivityEntry {
  id: number;
  action: string;
  summary: string | null;
  createdAt: string;
}

export interface AdminClientDetailResponse {
  client: AdminClientDetail;
  entitlements: string[];
  staff: AdminClientStaffMember[];
  members: AdminClientTenantUser[];
  activity: AdminClientActivityEntry[];
}

// One client's commercial record (GET/PATCH /api/admin/clients/:tenantId/billing)
// behind the Fulfillment cockpit's Billing tab: how the deal came in, cash
// collected vs outstanding, billing/renewal dates, account standing. Phase 1 is
// manual entry, so the four date fields are free text (typed exactly as the deal
// notes read) and the cash fields are whole dollars.
export interface AdminClientBilling {
  source: string;
  dateClosed: string;
  service: string;
  paymentArrangement: string;
  upfrontCash: number;
  remainingCash: number;
  totalCashCollected: number;
  billingDate: string;
  renewalDate: string;
  lastTouchpoint: string;
  churnDate: string;
  status: "active" | "churned";
  notes: string;
  // null until the record has been saved once (a client with no row yet).
  updatedAt: string | null;
}

// The PATCH body: everything except the server-owned updatedAt.
export type AdminClientBillingPatch = Omit<AdminClientBilling, "updatedAt">;

export interface AdminClientBillingResponse {
  billing: AdminClientBilling;
}

// --- Ad Tracker (the rebuild: derived from Meta + GHL, nothing typed) --------
// Ratios arrive computed so the client cannot recompute one differently and
// quietly disagree with the sheet this was ported from. null means the
// denominator was zero; render it as "-", never as 0.

export type AdTrackerRange = "all" | "7" | "30" | "90";
export type AdTrackerLevel = "campaign" | "adset" | "ad";

export interface AdTrackerKpis {
  leads: number;
  pickups: number;
  bookings: number;
  sales: number;
  revenue: number;
  spend: number;
  pickupRate: number | null;
  bookingRate: number | null;
  salesPct: number | null;
  closeRate: number | null;
  roas: number | null;
}

export interface AdTrackerBreakdownRow {
  id: string;
  name: string;
  spend: number;
  leads: number;
  bookings: number;
  sales: number;
  revenue: number;
  roas: number | null;
  costPerLead: number | null;
  costPerBooking: number | null;
}

export interface AdTrackerResponse {
  range: AdTrackerRange;
  level: AdTrackerLevel;
  kpis: AdTrackerKpis;
  breakdown: AdTrackerBreakdownRow[];
  // Leads in range with no ad id. The breakdown is the attributed subset, so
  // showing this is what stops the two looking like they disagree.
  unattributed: number;
  currency: string;
  meta: {
    pipelines: number;
    opportunities: number;
    spendDays: number;
    // No snapshot has ever been taken, which looks identical to "no spend".
    neverSynced: boolean;
  };
}

// An agency task in the admin "Tasks" tab, or a pillar task in a pillar
// workspace's Tasks tab. tenantId null + pillarId null = agency-wide; tenantId
// set = tied to that client (clientName is the joined label); pillarId set = a
// pillar task (operations, outreach, ...). A task is never both client + pillar.
export interface AdminTask {
  id: string;
  tenantId: string | null;
  pillarId: string | null;
  clientName: string | null;
  title: string;
  note: string | null;
  dueDate: string | null;
  completed: boolean;
  // status and completed are kept coupled on every write, client and server,
  // through deriveCoupling in src/lib/taskStatus.ts.
  status: TaskStatus;
  updates: string | null;
  createdAt: string;
}

// ===== Team comms (Phase 04) =====
// A participant is a staff_accounts row (owner included) or an admin_accounts row.
// senderKind / member kinds are always "staff" or "admin"; the id is the matching
// account id. Content is fetched through api<T>(); Realtime only signals "refetch".

export interface ChatRole {
  id: string;
  name: string;
  color: string;
  isPreset: boolean;
  sortOrder: number;
}

export interface ChatMember {
  id: string;
  name: string;
  roles: ChatRole[];
  online: boolean;
  lastSeen: string | null;
  canContactHauck: boolean;
}

export interface ChatChannel {
  id: string;
  kind: "channel" | "dm" | "hauck";
  name: string;
  memberIds: string[];
  unread: number;
  lastMessageAt: string | null;
}

export interface ChatAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
}

export interface ChatMessageDTO {
  id: string;
  channelId: string;
  senderKind: "staff" | "admin";
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  attachments: ChatAttachment[];
}

export interface AdminHauckThread {
  channelId: string;
  tenantId: string;
  tenantName: string;
  personName: string;
  unread: number;
  lastMessageAt: string | null;
}

// Returned by POST /api/chat/attachments. The browser PUTs file bytes to
// uploadUrl, then sends the attachmentId with the message.
export interface AttachmentUpload {
  attachmentId: string;
  uploadUrl: string;
  path: string;
  token: string;
}

// Product-tour progress (GET/POST /api/me/tour). completedVersion is the
// highest tour version this person has finished (null = never). unavailable =
// the backend cannot persist progress, so the client suppresses the tour.
export interface TourProgress {
  completedVersion: number | null;
  unavailable?: boolean;
}

export async function fetchTourProgress(personKey: string): Promise<TourProgress> {
  return api<TourProgress>(`/api/me/tour?personKey=${encodeURIComponent(personKey)}`);
}

export async function saveTourProgress(
  personKey: string,
  version: number,
): Promise<void> {
  await api<{ ok: boolean }>(`/api/me/tour`, {
    method: "POST",
    body: JSON.stringify({ personKey, version }),
  });
}

// Theory-of-Constraints admin command view (0022): one row per business
// pillar (acquisition/sales/delivery/operations) describing its current
// constraint, plus an ordered Identify/Exploit/Subordinate/Elevate/Repeat
// attack-plan. Backed by GET/PUT /api/admin/constraints.
export interface ConstraintStep {
  step: string;
  action: string;
  owner: string | null;
  status: "todo" | "doing" | "done";
  sort: number;
}

export interface PillarConstraint {
  pillar: "acquisition" | "sales" | "delivery" | "operations";
  title: string;
  severity: "high" | "med" | "low";
  metric: string | null;
  detail: string | null;
  impact: string | null;
  isSystem: boolean;
  throughputVal: string | null;
  throughputLabel: string | null;
  updatedAt: string;
  steps: ConstraintStep[];
}

export async function getConstraints(): Promise<PillarConstraint[]> {
  const { constraints } = await api<{ constraints: PillarConstraint[] }>(
    "/api/admin/constraints",
  );
  return constraints;
}

export async function saveConstraint(
  payload: Omit<PillarConstraint, "updatedAt">,
): Promise<PillarConstraint> {
  const { constraint } = await api<{ constraint: PillarConstraint }>(
    "/api/admin/constraints",
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );
  return constraint;
}

// Command home's agency-wide KPI row. Only the two fields the backend can
// compute truthfully today (see functions/api/admin/overview.ts); MRR and
// weekly leads have no agency-wide source yet and are never faked here, so
// the UI renders explicit "Not yet wired" tiles for those instead.
export interface AdminOverview {
  activeClients: number;
  combinedSpend: number;
}

export async function getAdminOverview(): Promise<AdminOverview> {
  return api<AdminOverview>("/api/admin/overview");
}

// One logged day of the agency's own sales-call funnel (Sales pillar > Sales
// Data, migration 0030). Raw counts only: every rate the page shows is derived
// in src/lib/salesTracker.ts, so nothing computed crosses the wire. A null field
// is a cell nobody has filled in, which is not the same as a zero.
export interface SalesDataRow {
  day: string; // "YYYY-MM-DD", the row's identity
  callsOnCalendar: number | null;
  rescheduledCancelled: number | null;
  callsTaken: number | null;
  qualified: number | null;
  closed: number | null;
  cashCollected: number | null;
  notes: string | null;
}

// The subset of a day a single save carries. The endpoint upserts, so fields
// left out keep whatever is stored: editing one cell never blanks the rest.
export type SalesDataPatch = Partial<Omit<SalesDataRow, "day">>;

// Only the days that have a row. The client generates the empty ones, so an
// unlogged day stays visibly empty rather than arriving as a fabricated zero.
export async function getSalesData(month: string): Promise<SalesDataRow[]> {
  const { days } = await api<{ days: SalesDataRow[] }>(
    `/api/admin/tracker/sales-data?month=${encodeURIComponent(month)}`,
  );
  return days;
}

export async function saveSalesDataDay(
  day: string,
  patch: SalesDataPatch,
): Promise<SalesDataRow> {
  const res = await api<{ ok: true; day: SalesDataRow }>(
    "/api/admin/tracker/sales-data",
    { method: "PATCH", body: JSON.stringify({ day, ...patch }) },
  );
  return res.day;
}

// Business Health (0030): the agency's own numbers, one row per period key.
// Agency-global, so nothing here is scoped to a tenant. The response carries
// only the hand-entered inputs; CAC/ROAS/LTV and the end client count are
// derived from them in src/lib/businessHealth.ts and never stored.
export interface BusinessHealthResponse {
  period: string;
  periodType: PeriodType;
  inputs: BusinessHealthInputs;
  // null when the period has no saved row yet (an untouched, all-zero period).
  updatedAt: string | null;
}

export async function getBusinessHealth(period: string): Promise<BusinessHealthResponse> {
  return api<BusinessHealthResponse>(
    `/api/admin/tracker/business-health?period=${encodeURIComponent(period)}`,
  );
}

// Upserts the period row. Sends only the fields that changed, so a single-field
// autosave stays a single-field write.
export async function saveBusinessHealth(
  period: string,
  periodType: PeriodType,
  inputs: Partial<BusinessHealthInputs>,
): Promise<BusinessHealthResponse> {
  return api<BusinessHealthResponse>("/api/admin/tracker/business-health", {
    method: "PATCH",
    body: JSON.stringify({ period, periodType, inputs }),
  });
}

// The task status union lives with the pure coupling helpers so the client
// hook and the endpoints validate against one source.
import type { TaskStatus } from "./taskStatus";

export type { TaskStatus };

// ===== Operations pillar: Scaling Calculator =====
// The seven inputs persist agency-globally (a single row) so the calculator
// remembers Jake's last numbers. The compute itself is client-side and never
// waits on this; see src/lib/scalingCalculator.ts for the math.
import type { ScalingInputs } from "./scalingCalculator";

export type { ScalingInputs };

export async function getScalingCalculator(): Promise<ScalingInputs> {
  return api<ScalingInputs>("/api/admin/tracker/scaling-calculator");
}

export async function saveScalingCalculator(
  body: ScalingInputs,
): Promise<ScalingInputs> {
  return api<ScalingInputs>("/api/admin/tracker/scaling-calculator", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

// ===== Operations pillar: Time Audit =====
// Domain types live in src/lib/timeAudit.ts (the pure lib owns the tier and
// task configs), re-exported here so callers keep importing DTOs from api.ts.
import type {
  Leverage,
  TaskType,
  TimeAuditBlock,
  TimeAuditWeekResponse,
} from "./timeAudit";

export type { Leverage, TaskType, TimeAuditBlock, TimeAuditWeekResponse };

// Setting a block carries its tier; clearing it sends taskType null and the
// endpoint deletes the row (untagged means no row, never a null tag).
export type TimeAuditTagBody =
  | {
      weekStart: string;
      dayOfWeek: number;
      slot: number;
      leverage: Leverage;
      taskType: TaskType;
    }
  | { weekStart: string; dayOfWeek: number; slot: number; taskType: null };

export async function getTimeAuditWeek(
  weekStart: string,
): Promise<TimeAuditWeekResponse> {
  return api<TimeAuditWeekResponse>(
    `/api/admin/tracker/time-audit?week=${encodeURIComponent(weekStart)}`,
  );
}

export async function tagTimeAuditBlock(
  body: TimeAuditTagBody,
): Promise<TimeAuditBlock | { cleared: true }> {
  return api<TimeAuditBlock | { cleared: true }>(
    "/api/admin/tracker/time-audit",
    { method: "PATCH", body: JSON.stringify(body) },
  );
}

// ---------------------------------------------------------------------------
// Acquisition pillar surfaces (Leads, Cold Call, Cold SMS).
//
// All three are agency-internal and agency-global: no tenant scoping, admin-only,
// served from /api/admin/tracker/*. Phase 1 is manual entry with the app DB as
// the source of truth, so every count is nullable: a blank cell round-trips as
// null, never as a fabricated 0. Rates are computed client-side (src/lib/
// adminLeads.ts, coldCall.ts, coldSms.ts) and never persisted.
// ---------------------------------------------------------------------------

// Leads (Acquisition > Leads): the hand-kept agency prospect book.
// Mirrors the CHECK constraint in migration 0030; LEAD_STATUSES in
// src/lib/adminLeads.ts is the ordered runtime copy.
export type AdminLeadStatus =
  | "New"
  | "Contacted"
  | "No Answer"
  | "Booked"
  | "Qualified"
  | "Closed"
  | "Dead";

export interface AdminLead {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  timezone: string;
  status: AdminLeadStatus;
  firstContactDate: string | null; // "YYYY-MM-DD"
  source: string;
  appointmentDate: string | null;
  noAnswer: number;
  lastContact: string | null;
  followUpDate: string | null;
  email: string;
  notes: string;
  createdAt: string;
}

// Cold Call (Acquisition > Cold Call): one row per dialing day.
export interface ColdCallRow {
  id: string;
  day: string; // "YYYY-MM-DD"
  callsMade: number | null;
  pickups: number | null;
  passThrough: number | null;
  meetingsBooked: number | null;
  objections: string | null;
  notes: string | null;
}

// Cold SMS (Acquisition > SMS): three sub-views, three row shapes.
export interface ColdSmsDailyRow {
  id: string;
  day: string; // "YYYY-MM-DD"
  smsSent: number | null;
  positiveReplies: number | null;
  meetingsBooked: number | null;
  note: string | null;
}

export interface ColdSmsMonthlyRow {
  id: string;
  month: string; // "YYYY-MM-01" (first of month)
  totalSmsSent: number | null;
  vaCost: number | null;
  callsBooked: number | null;
  callsShowed: number | null;
  smsCost: number | null;
  newClients: number | null;
  cashCollected: number | null;
  ltv: number | null;
}

export interface ColdSmsScriptRow {
  id: string;
  name: string;
  totalSent: number | null;
  positiveReplies: number | null;
  callsBooked: number | null;
  clientsClosed: number | null;
  sortOrder: number;
}

// Setter Suite (Sales / admin-only). Mirrors the shapes returned by
// functions/api/admin/setter/pipelines.ts and functions/api/admin/setter/leads.ts
// exactly; see those files for the shaping logic.
export interface ApiSetterStage {
  id: string;
  name: string;
  // Live GHL hex, e.g. "#F97316". Rendered as an 8px dot only, per Board.tsx's
  // convention: never a background, border, or text color.
  color?: string;
  // True when the live stage name matches /needs dialing/i. No mapping table.
  needsDialing: boolean;
}

export interface ApiSetterPipeline {
  id: string;
  name: string;
  stages: ApiSetterStage[];
}

// Deliberately has no `tags` field: the list endpoint cannot supply it
// without an N+1 contact fetch per card across the whole board (see
// functions/api/admin/setter/leads.ts). Tags belong to the per-lead detail
// endpoint (a later task), which fetches one contact at a time.
export interface ApiSetterLead {
  id: string;
  contactId: string;
  name: string;
  phone: string;
  city: string;
  stageName: string;
  createdAt: string;
  attempts: number;
  firstDialedAt: string | null;
  contacted: boolean;
  lastOutcome: string | null;
}

export interface ApiSetterLeadsResponse {
  leads: ApiSetterLead[];
  // The leads endpoint caps at 1000 opportunities per pipeline
  // (functions/lib/ghl.ts fetchAllOpportunities, maxPages: 10 at 100/page).
  // The board must show this honestly rather than silently drop leads.
  truncated: boolean;
}

// One row of setter_dials, camelCased exactly as
// functions/api/admin/setter/dials.ts:shapeDialRow returns it. Shared by the
// lead detail endpoint (dials, newest first) and the dial-logging response.
export interface ApiSetterDial {
  id: string;
  contactId: string;
  opportunityId: string | null;
  pipelineName: string | null;
  stageName: string | null;
  dialedAt: string;
  spoke: boolean;
  outcome: string;
  note: string | null;
  tagsApplied: string[];
  createdBy: string | null;
  createdAt: string;
}

// The cockpit's single-lead panel. Mirrors
// functions/api/admin/setter/lead/[contactId].ts's ApiSetterLeadDetail
// exactly: unlike ApiSetterLead (the board card), this DOES carry tags,
// fetched from one contact so it costs nothing extra.
export interface ApiSetterLeadDetail {
  contactId: string;
  name: string;
  phone: string;
  email: string;
  tags: string[];
  dials: ApiSetterDial[];
}
