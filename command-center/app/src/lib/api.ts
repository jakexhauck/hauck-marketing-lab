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

// An agency task in the admin "Tasks" tab. tenantId null means agency-wide;
// otherwise it is tied to that client (clientName is the joined display label).
export interface AdminTask {
  id: string;
  tenantId: string | null;
  clientName: string | null;
  title: string;
  dueDate: string | null;
  completed: boolean;
  createdAt: string;
}

export interface ApiWorkBlock {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  color: string;
  googleEventId: string | null;
}

export interface ApiGoogleCalEvent {
  id: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
}

export interface CalendarBlocksResponse {
  blocks: ApiWorkBlock[];
  googleEvents: ApiGoogleCalEvent[];
  connection: { connected: boolean; email: string | null };
  syncError?: string;
}
