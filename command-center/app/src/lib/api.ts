import { demoMode } from "../demo/demoMode";
import { handleDemoRequest } from "../demo/handler";

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
  channel?: "sms" | "email" | "ig" | "messenger" | "other";
  origin?: "form" | "chat" | "paid" | "react" | "call" | "social" | "other";
  source?: string;
  firstTouchAt?: string;
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
