// API types shared across CRM frontends. Copied verbatim from
// client-dashboard/src/lib/api.ts (the mobile app remains the source of truth for
// the backend contract). If the backend response shape changes, update both until
// the mobile app is re-pointed at this package.

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
}

export interface ApiPipelineSummary {
  id: string;
  name: string;
  stages: { id: string; name: string }[];
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

export interface ApiConversation {
  id: string;
  contactId: string;
  name: string;
  preview: string;
  lastMessageType: string;
  lastMessageAt: string;
  unreadCount: number;
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
}

// ---------------------------------------------------------------------------
// Response wrappers + auxiliary shapes the UI consumes. These mirror what the
// existing handlers return; named here so frontends don't re-type them inline.
// ---------------------------------------------------------------------------

export interface ApiLeadsResponse {
  leads: ApiLead[];
  total: number;
}

export interface ApiContactsResponse {
  contacts: ApiContact[];
  total: number;
}

export interface ApiConversationsResponse {
  conversations: ApiConversation[];
  total: number;
}

export interface ApiPipelinesResponse {
  pipelines: ApiPipelineSummary[];
}

export interface ApiMessagesResponse {
  conversationId?: string;
  messages: ApiMessage[];
  truncated?: boolean;
  unreadCount?: number;
  defaultChannel?: string;
  availableChannels?: string[];
}

export interface ApiSendResponse {
  ok: boolean;
  messageId?: string;
  conversationId?: string;
}

export interface ApiInvoicesResponse {
  invoices: ApiInvoice[];
  total: number;
}

export interface ApiCalendarResponse {
  events: ApiCalendarEvent[];
  timezone: string | null;
}

export interface ApiActivityResponse {
  activity: ApiActivity[];
}

export interface ApiNotificationsResponse {
  notifications: ApiNotification[];
  unreadCount: number;
}

export interface ApiTenantResponse {
  tenant: ApiTenant | null;
}

export interface ApiNotesResponse {
  notes: ApiNote[];
}

export interface ApiTasksResponse {
  tasks: ApiTask[];
}

export type SessionMode = "live" | "test";

// Lightweight caller identity for a signed-in staff member (subset of the full
// staff record). Owner sessions report staff: null.
export interface ApiStaffIdentity {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface ApiMe {
  ok: boolean;
  mode: SessionMode;
  // Staff accounts (0007). isOwner is true for the shared-password owner OR a
  // staff row with role 'owner'; such callers bypass per-surface checks and the
  // permissions map is empty. Staff callers carry their effective grants.
  isOwner?: boolean;
  staff?: ApiStaffIdentity | null;
  permissions?: import("./permissions").EffectivePermissions;
}

export interface ApiLoginResponse {
  ok: boolean;
  mode: SessionMode;
  // Additive (Phase 2.2): the raw signed session token, for bearer-auth clients
  // (desktop). Web clients ignore it and use the HttpOnly cookie.
  token?: string;
}

export interface ApiStaffLoginResponse {
  ok: boolean;
  mode: SessionMode;
  token?: string;
  staff: { id: string; name: string; role: Role };
}

// A staff member as returned by GET /api/staff (owner-only management list).
export interface ApiStaffAccount {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "disabled";
  ghlUserId: string | null;
  createdAt: string;
  permissions: import("./permissions").StaffPermission[];
}

export interface ApiStaffListResponse {
  staff: ApiStaffAccount[];
}

export interface ApiEntitlementsResponse {
  capabilities: import("./permissions").Capability[];
}

// Payload the owner UI sends to create/update a staff member.
export interface StaffWriteInput {
  name: string;
  email: string;
  password?: string;
  role: Role;
  permissions: import("./permissions").StaffPermission[];
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
}

export type Role = "owner" | "manager" | "rep";

export interface Identity {
  id: string;
  name: string;
  email: string;
  role: Role;
}
