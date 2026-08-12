import { demoMode } from "../demo/demoMode";
import { handleDemoRequest } from "../demo/handler";
import { previewHeaders } from "./previewFrame";
import type { BusinessHealthInputs, PeriodType } from "./businessHealth";
import type { DerivedSalesDay } from "../../functions/lib/salesDataRollup";
import type { OfferSplitRow, SourceSplitRow } from "../../functions/lib/salesCalls";

// What one reconciliation against the agency's GoHighLevel calendars did.
// Shared by the two pages that trigger one: Sales Calls and Sales Data.
export interface SalesCallSyncResult {
  // Meetings the console had never seen, now on the page.
  added: number;
  // Rows whose time or calendar status moved underneath us.
  updated: number;
  unchanged: number;
  // Calendars GoHighLevel would not read. Named rather than swallowed: a page
  // missing one calendar looks exactly like a quiet week.
  failedCalendarIds: string[];
  // How many calendars were treated as sales calendars. Zero means the account
  // has none this app recognises, which a page must say out loud rather than
  // rendering as a month with no meetings in it.
  calendarsRead: number;
}

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

// A lead a setter has qualified and handed to the business owner. Fully
// internal to the app: no GHL. The setter creates one (opening a group chat
// that connects the owner with the customer); the owner works it to a close.
//
// Lifecycle:
//   new          handed off, owner has not replied yet
//   working      owner is engaged in the group chat
//   estimate_set an in-home estimate / appointment is booked
//   won          job sold
//   lost         not sold
//   later        parked for a future follow-up (seasonal, "not now")
export type HandoffStatus =
  | "new"
  | "estimate_set"
  | "job_booked"
  | "won"
  | "lost"
  | "later";

// Why a handoff was lost, for the "why deals die" rollup.
export type HandoffLostReason = "price" | "timing" | "competitor" | "ghosted" | "diy" | "other";

export interface ApiHandoff {
  id: string;
  contactId: string;
  name: string;
  phone: string;
  // Who qualified and handed it over (a Hauck setter's name).
  setterName: string;
  status: HandoffStatus;
  // Job value in dollars, set when the owner marks it Won. Optional.
  value: number | null;
  lostReason: HandoffLostReason | null;
  // Lifecycle timestamps. handedAt is always set; the rest fill in as the lead
  // moves, and drive the funnel + owner-accountability metrics.
  handedAt: string;
  firstOwnerReplyAt: string | null; // owner's first message = response time
  estimateAt: string | null; // booked estimate appointment (Home Estimate cal)
  jobAt: string | null; // booked install appointment (Job cal)
  followUpAt: string | null; // scheduled follow-up (becomes a GHL task)
  followUpNote: string | null; // the follow-up task note
  address: string | null; // service address, captured at the estimate booking
  service: string | null; // service + scope, captured at the estimate booking
  closedAt: string | null; // when won / lost / later was recorded
  // Latest line in the group chat + unread count, for the list preview.
  lastMessage: string | null;
  lastMessageAt: string | null;
  unread: number;
}

// One line in a handoff's group chat. Three participants: the customer (the
// lead), the owner (the logged-in business owner), and the setter (Hauck) who
// connected them.
export type HandoffSender = "owner" | "customer" | "setter";

export interface HandoffMessage {
  id: string;
  handoffId: string;
  sender: HandoffSender;
  senderName: string;
  body: string;
  at: string; // ISO
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
  // "where is this contact in the Google Reviews pipeline?" (this can).
  // Optional: absent from payloads cached by a bundle that predates it, so always
  // read it through `convPipelines()` rather than touching it directly.
  pipelines?: ConversationPipeline[];
  // Does this belong in the Inbox, as opposed to merely being in the payload?
  // The server sets it false for a review request, which is only here because
  // Reviews > Chats reads this same feed. Optional, and absent means TRUE: demo
  // data and any payload cached by a bundle that predates the field must not
  // vanish from the Inbox. Always read it through `isInboxConversation()`.
  inbox?: boolean;
}

// The one safe way to ask whether a conversation belongs in the Inbox. Absent
// means yes, so this can never empty an Inbox on a stale payload.
export function isInboxConversation(c: ApiConversation): boolean {
  return c.inbox !== false;
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
// Paid Ads before, so never touch `c.pipelines` directly.
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
  // The client's Meta ad account, or null when their ads are not wired yet.
  // The Fulfillment Paid Ads page gates its sub-tabs on this.
  metaAdAccountId: string | null;
  monthlySpend: number;
  memberCount: number;
  createdAt: string;
  // From migration 0022 (tenants.health_status / health_note): a manual
  // per-subaccount health flag surfaced in the Service Delivery roster rail.
  // 500s at the endpoint until that migration is applied to the live DB.
  healthStatus: "healthy" | "warn" | "paused";
  healthNote: string | null;
  // 'setup' until Go Live is pressed on Onboarding, 'live' after. What the
  // Onboarding picker filters on, and what the middleware's onboarding gate
  // reads to decide whether the client sees their app or the holding screen.
  onboardingStatus: "setup" | "live";
}

// What POST /api/admin/clients answers with when the wizard creates a client.
// The two warnings are deliberately not errors: the client exists either way,
// and both name something Jake can fix afterwards without redoing the form.
export interface AdminClientCreated {
  ok: true;
  id: string;
  slug: string;
  /** The owner login could not be created (usually a duplicate email). */
  ownerWarning?: string;
  /** The onboarding record could not be written. */
  onboardingWarning?: string;
  /** No Drive folder was made, and why. */
  driveWarning?: string;
  driveFolderUrl?: string;
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

// --- Onboarding (Fulfillment cockpit's Onboarding tab) -----------------------
// One client's whole onboarding record: the setup values we push into their GHL
// sub-account, their own intake answers, and where they are in the checklist.
// The GHL token is write-only over this API: it is saved onto the tenant and
// never read back, so hasToken is the only thing the UI can say about it.

// One row of the Onboarding page's roster. tasksDone counts recorded ticks
// only; the three GHL-checked tasks are answered live on the client's own page.
export interface AdminOnboardingListItem {
  id: string;
  name: string;
  slug: string;
  niche: string;
  brandColor: string;
  brandInitials: string;
  status: string;
  provisionedAt: string | null;
  tasksDone: number;
  tasksTotal: number;
}

export interface AdminOnboardingListResponse {
  clients: AdminOnboardingListItem[];
}

export interface AdminOnboardingResponse {
  fields: Record<string, string>;
  intake: Record<string, string>;
  status: string;
  hasToken: boolean;
  provisionResult: AdminProvisionResult | null;
  name: string;
  /** 'setup' = held at the holding screen, 'live' = their app is open. */
  onboardingStatus: string;
}

export interface AdminGoLiveResult {
  ok: true;
  onboardingStatus: "live";
  alreadyLive?: boolean;
}

export interface AdminOnboardingSavePatch {
  fields?: Record<string, string>;
  intake?: Record<string, string>;
}

export interface AdminOnboardingChecklistItem {
  task_key: string;
  done: boolean;
  value: string | null;
}

export interface AdminOnboardingChecklistResponse {
  items: AdminOnboardingChecklistItem[];
}

export interface AdminOnboardingReadinessCheck {
  key: string;
  ok: boolean;
  detail: string;
}

export interface AdminOnboardingReadinessResponse {
  checks: AdminOnboardingReadinessCheck[];
}

// What a provision run wrote, what it could not write, and which custom values
// the sub-account does not have. Stored on the row, so the tab can show the
// last run without re-running it.
export interface AdminProvisionResult {
  written: string[];
  failed: { name: string; status: number }[];
  notFound: string[];
  at?: string;
}

export interface AdminProvisionResponse extends AdminProvisionResult {
  ok: boolean;
  error?: string;
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

// The id of the aggregate breakdown row carrying spend that the live-campaign
// scope excluded, so the column reconciles with the Ad Spend figure in Results.
// Must match OTHER_ID in functions/lib/adTrackerMetrics.ts, which produces it.
export const AD_TRACKER_OTHER_ID = "__other__";

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
  // Running in Meta right now. Badged "Live" and sorted to the top.
  live: boolean;
}

export interface AdTrackerResponse {
  range: AdTrackerRange;
  level: AdTrackerLevel;
  // Absent on an older deploy, which means the derived twelve, as it always was.
  statusMode?: TrackerStatusMode;
  kpis: AdTrackerKpis;
  breakdown: AdTrackerBreakdownRow[];
  // Leads in range with no ad id. The breakdown is the attributed subset, so
  // showing this is what stops the two looking like they disagree.
  unattributed: number;
  currency: string;
  meta: {
    opportunities: number;
    spendDays: number;
    // No snapshot has ever been taken, which looks identical to "no spend".
    neverSynced: boolean;
    // Most recent day in the spend snapshot (YYYY-MM-DD), null when empty.
    // Every cost and ROAS figure divides by spend, so a snapshot running days
    // behind makes them quietly wrong. Surfaced so staleness is visible.
    lastSpendDate: string | null;
    // Campaigns the breakdown is scoped to. Empty means it is showing
    // everything: nothing is live, or no structure has been synced yet.
    liveCampaigns: string[];
  };
}

// The client Lead Tracker (the Leads page): the admin Ad Tracker payload plus
// per-lead rows. Status is derived server-side from the lead's furthest GHL
// stage (Jake's 12-status model, functions/lib/leadStatus.ts); a card in the
// Trash pipeline reads "lost", and "won" outranks it.
//
// Keep this union in step with ClientLeadStatus on the server. It is duplicated
// rather than imported because functions/ and src/ are separate tsconfigs.
export type AutoLeadStatus =
  | "new"
  | "contacted"
  | "phone_follow_up"
  | "long_term_nurture"
  | "phone_appt_booked"
  | "phone_appt_confirmed"
  | "handed_off"
  | "follow_up"
  | "estimate_booked"
  | "job_booked"
  | "won"
  | "lost";

// The eight a client TYPES, on a business that works its own leads
// (tenants.manual_lead_status, 0102). Keep in step with MANUAL_STATUS_ORDER in
// functions/lib/leadStatus.ts.
export type ManualLeadStatus =
  | "new"
  | "contacted"
  | "no_answer"
  | "follow_up"
  | "appointment_booked"
  | "quoted"
  | "won"
  | "lost";

export const MANUAL_LEAD_STATUSES: ManualLeadStatus[] = [
  "new",
  "contacted",
  "no_answer",
  "follow_up",
  "appointment_booked",
  "quoted",
  "won",
  "lost",
];

export type LeadTrackerStatus = AutoLeadStatus | ManualLeadStatus;

// Which of the two the rows are speaking, decided per tenant by the server.
// "manual" also means the status cell is editable.
export type TrackerStatusMode = "auto" | "manual";

// The one date that matters for a lead, given its status: the GHL appointment
// for the booked statuses, the next open task's due date for the ones we are
// chasing. Null when neither exists yet (nothing booked, no task created).
export interface LeadTrackerWhen {
  at: string;
  kind: "appointment" | "follow_up";
  label: string;
}

export interface LeadTrackerLead {
  contactId: string;
  // For linking into the close-out flow. Null when the contact has no card.
  opportunityId: string | null;
  name: string;
  email: string;
  phone: string;
  createdAt: string;
  status: LeadTrackerStatus;
  when: LeadTrackerWhen | null;
  // Dollars. Null on a manual tenant means nobody has typed a job value yet,
  // which is not the same as a job worth nothing.
  value: number | null;
  campaignName: string | null;
  adsetName: string | null;
  adName: string | null;
  adId: string | null;
}

export interface LeadTrackerResponse extends AdTrackerResponse {
  leads: LeadTrackerLead[];
}

// The Meta Data tab: the raw daily per-ad snapshot (the sheet's META DATA tab).
export interface MetaDataRow {
  date: string;
  spend: number;
  impressions: number;
  reach: number;
  linkClicks: number;
  campaignName: string;
  campaignId: string;
  adsetName: string;
  adsetId: string;
  adName: string;
  adId: string;
}

export interface MetaDataResponse {
  rows: MetaDataRow[];
  currency: string;
}

// Where this client's ad creatives live in Google Drive, and what is in there.
// Both folder fields are null until an operator maps one, and `url` is rebuilt
// server-side from the id rather than stored.
export type CreativeKind = "image" | "video" | "pdf" | "sheet" | "zip" | "doc";

export interface CreativeFile {
  id: string;
  name: string;
  kind: CreativeKind;
  webViewLink: string | null;
  modifiedTime: string | null;
  size: number | null;
  // Drive's own short-lived thumbnail URL, loaded by the browser directly.
  // Composio's transport cannot move file bytes, so there is no proxied path to
  // an image; a tile whose thumbnail fails falls back to a type icon.
  thumbnailUrl: string | null;
}

// One of the 1000 biggest US cities, with what we have already done there.
// `runs` and `leads` are deliberately separate: a city can be worked and yield
// nothing, or hold leads that arrived without a run naming it, and one merged
// "scraped" flag would hide both.
export interface LeadCity {
  rank: number;
  city: string;
  stateName: string;
  stateCode: string;
  population: number | null;
  growthPct: number | null;
  // How many scrape runs named this city.
  runs: number;
  lastRunAt: string | null;
  // How many leads in the book carry it.
  leads: number;
}

export interface LeadCitiesResponse {
  cities: LeadCity[];
  // The niches present in the run history, for the filter.
  niches: string[];
  niche: string | null;
}

// One level of the Drive folder picker.
export interface CreativesBrowseResponse {
  connected: boolean;
  // Which Google account is being browsed. Display only.
  email: string | null;
  folders: { id: string; name: string }[];
  error: string | null;
}

export interface CreativesFolderResponse {
  folderId: string | null;
  url: string | null;
  // False means the agency Google account has never been connected, so the
  // folder link works but its contents cannot be listed. Distinct from an empty
  // folder, and shown differently.
  connected: boolean;
  files: CreativeFile[];
  // Drive answered badly (folder deleted, access revoked, quota). Surfaced
  // rather than rendered as an empty folder.
  error: string | null;
}


// An agency task in the admin "Tasks" tab, or a pillar task in a pillar
// workspace's Tasks tab. tenantId null + pillarId null = agency-wide; tenantId
// set = tied to that client (clientName is the joined label); pillarId set = a
// pillar task (operations, outreach, ...). A task is never both client + pillar.
export interface AdminTask {
  id: string;
  tenantId: string | null;
  pillarId: string | null;
  // The operator's own category (admin_task_categories, 0063). null is
  // Uncategorised, which is a normal state, not a missing value.
  categoryId: string | null;
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

// A category on the admin Tasks checklist. Operator-managed: added, renamed,
// recoloured and deleted from the console, never seeded. `color` is a palette
// token from src/lib/taskCategories.ts, resolved to theme tints at render.
export interface AdminTaskCategory {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
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

// One day of the agency's own sales-call funnel (Sales pillar > Sales Data).
//
// DERIVED, never typed. Each field is counted from the meetings themselves
// (public.sales_calls) by functions/lib/salesDataRollup.ts, so this page and
// the Sales Calls page can never disagree about a month. There is no save: the
// endpoint has no PATCH any more.
export interface SalesDataDay extends DerivedSalesDay {
  day: string; // "YYYY-MM-DD", the row's identity
}

export interface SalesDataResponse {
  // Only the days a meeting sat on. The client generates the empty ones, so a
  // month with no selling in it stays visibly empty rather than arriving as a
  // run of fabricated zero rows.
  days: SalesDataDay[];
  // False when the agency GoHighLevel account is not connected at all.
  configured: boolean;
  // What the calendar read did on the way through, or null when it was skipped.
  sync: (SalesCallSyncResult & { ok: true }) | { ok: false; error: string } | null;
  // Meetings the calendar gave no time, so they belong to no day.
  undated: number;
  // The month split by where the meetings came from, busiest first.
  sources: SourceSplitRow[];
  // The month split by which offer was pitched (0086), best close rate first.
  // Only meetings somebody turned up to.
  offers: OfferSplitRow[];
  // How many of the month's nos gave each reason, keyed by SALES_NO_REASONS.
  reasons: Record<string, number>;
}

// `sync: false` reads what is stored without re-reading the calendars.
export async function getSalesData(month: string, sync = true): Promise<SalesDataResponse> {
  return api<SalesDataResponse>(
    `/api/admin/tracker/sales-data?month=${encodeURIComponent(month)}` + (sync ? "" : "&sync=0"),
  );
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

// The Setter Suite dialing script: one formatted document per client,
// authored in the Settings tab and rendered by the cockpit's script overlay.
// The html is sanitized server-side on every write
// (functions/lib/setterScript.ts), which is what makes it safe to render.
export interface SetterScriptResponse {
  html: string;
  updatedAt: string | null;
}

export async function getSetterScript(tenantId: string): Promise<SetterScriptResponse> {
  return api<SetterScriptResponse>(
    `/api/admin/setter/script?tenantId=${encodeURIComponent(tenantId)}`,
  );
}

export async function saveSetterScript(
  tenantId: string,
  html: string,
): Promise<SetterScriptResponse> {
  return api<SetterScriptResponse>("/api/admin/setter/script", {
    method: "PATCH",
    body: JSON.stringify({ tenantId, html }),
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
// Mirrors the CHECK constraint in migration 0076_cold_call_stage_names.sql;
// COLD_CALL_STAGES in src/lib/coldCallStages.ts is the ordered runtime copy.
//
// Every name except "Booked" is a live stage on the agency's Cold Calling
// pipeline in GoHighLevel, and the sync matches on it verbatim.
export type AdminLeadStatus =
  | "New Lead"
  | "No Answer Day 1"
  | "No Answer Day 2"
  | "Call Back"
  | "Booked"
  | "Not Interested";

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
  // The time of day agreed for that callback (0064), "HH:MM:SS" as Postgres
  // returns it. Null means a day was agreed and no time, which is a real
  // answer: see src/lib/callbackTimes.ts.
  followUpTime: string | null;
  email: string;
  notes: string;
  // Who the business is (0059). The book calls businesses, not people: before
  // these existed the company name was buried in notes and the niche in source.
  businessName: string;
  niche: string;
  website: string;
  city: string;
  state: string;
  // Whose queue this lead sits in (0049). Null = in the book, on nobody's list.
  assignedTo: string | null;
  createdAt: string;
  // The prospect's record in the agency's own GoHighLevel account (0053).
  // Written by the app's push, never edited here.
  ghlContactId: string | null;
  ghlSyncedAt: string | null;
  // Why the last push failed, in words a caller can read. Null when it worked.
  ghlError: string | null;
}

// What the app recorded for a day, derived from cold_call_dials (0052): one
// attempt per outcome pressed on the call card. Null when nothing was dialled in
// the app that day.
export interface ColdCallRecorded {
  // How many of the day's nos gave each reason, keyed by the reason. The
  // Objections cell is written from this when nobody typed over it.
  reasons?: Record<string, number>;
  callsMade: number;
  pickups: number;
  passThrough: number;
  meetingsBooked: number;
}

// Cold Call (Acquisition > Cold Call): one row per dialing day.
//
// The four counts are what somebody TYPED, and null means they typed nothing.
// `recorded` is what the app measured. The grid shows the typed number when
// there is one and the recorded number otherwise; see src/lib/coldCall.ts.
export interface ColdCallRow {
  id: string;
  day: string; // "YYYY-MM-DD"
  callsMade: number | null;
  pickups: number | null;
  passThrough: number | null;
  meetingsBooked: number | null;
  objections: string | null;
  notes: string | null;
  recorded: ColdCallRecorded | null;
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

// locationId is the client's own CRM location, resolved server-side per tenant.
// The cockpit needs it to link a lead to its CRM contact record, which is how a
// setter dials from the client's business number (lib/setterModel.ts:
// ghlContactUrl). It rides this response because the GHL context is already
// resolved on that route, once per client selection.
export interface ApiSetterPipelinesResponse {
  pipelines: ApiSetterPipeline[];
  locationId: string;
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
  // When this opportunity last moved (status change, else any update); the
  // Results tab's "recently won" sort/window key. Null when GHL sends neither.
  updatedAt: string | null;
  attempts: number;
  firstDialedAt: string | null;
  contacted: boolean;
  lastOutcome: string | null;
  // The contact's CRM tags, carried inline on the opportunity search response
  // (no extra fetch). Load-bearing since the CRM rebuild: the follow-up tag a
  // lead should get, and whether its booking is confirmed, are both derived
  // from these. Empty array when the location's response omits them.
  tags: string[];
  // Channels the CRM has switched off for this contact, or null when their
  // record was not in the roster the server read. Null is not an all-clear.
  dnd: ApiContactDnd | null;
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
  // Read off the same contact record as the phone number above, so the
  // cockpit's warning and the number it sits next to can never disagree.
  dnd: ApiContactDnd | null;
}

// One bookable calendar, from functions/api/admin/setter/calendars.ts. The
// booking flow picks from this list by id; it used to resolve a calendar by
// NAME, which was a lossy round trip once a real list was available.
export interface ApiSetterCalendar {
  id: string;
  name: string;
  isActive: boolean;
}

// One booked appointment across all of a client's active calendars, from
// functions/api/admin/setter/events.ts. Times are nullable because GHL will
// return an event carrying neither; the Calendar tab has to survive that
// rather than drop the booking. `contactName` is whatever GHL already had on
// the event: that route deliberately does not pull a contact-name map to fill
// the blanks (the client-app route does, at up to 1000 contacts a request),
// so an empty string is a normal answer here.
export interface ApiSetterEvent {
  id: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
  contactId: string;
  contactName: string;
}

// The events response, which is deliberately more than a bare list. One of the
// client's calendars failing no longer rejects the whole request, so the grid
// can render partially. `incomplete` is how a caller learns that happened, and
// it MUST be surfaced: this tab writes, and a setter reading a partial grid as
// complete can book a customer on top of an appointment they were never shown.
// `failedCalendars` is a count rather than ids, because a raw GHL calendar id
// means nothing to a setter.
export interface ApiSetterEventsResponse {
  events: ApiSetterEvent[];
  incomplete: boolean;
  failedCalendars: number;
}

// One contact note off the live CRM record (functions/api/admin/setter/notes).
export interface ApiSetterNote {
  id: string;
  body: string;
  dateAdded?: string;
}

// One pending scheduled callback (functions/api/admin/setter/callbacks).
// Mirror of a dated CRM follow-up task; the board rail renders these.
export interface ApiSetterCallback {
  id: string;
  contactId: string;
  contactName: string;
  title: string;
  dueAt: string;
  ghlTaskId: string | null;
}

export interface ApiSetterCallbacksResponse {
  callbacks: ApiSetterCallback[];
}

// One scoreboard window's numbers (functions/lib/setterScoreboard.ts).
// bookRate is null (not 0) when nobody was reached: "reaching people and
// booking none" and "reaching nobody" are different failures.
export interface ApiScoreboardMetrics {
  dials: number;
  reached: number;
  booked: number;
  bookRate: number | null;
}

// GET /api/admin/setter/scoreboard: both windows in one response. Speed to
// lead is deliberately absent (computed client-side from board leads; see
// medianSpeedToLeadMs in setterModel.ts).
export interface ApiSetterScoreboard {
  today: ApiScoreboardMetrics;
  week: ApiScoreboardMetrics;
}

// A client's Google Calendar busy hours, from
// functions/api/admin/setter/busy.ts. Availability only: no titles, no
// attendees. `connected` is what separates "linked, nothing busy" from "never
// linked", which is a normal state and not an error, so that route never
// fails and both cases arrive as a 200 with an empty `busy`.
export interface ApiSetterBusy {
  connected: boolean;
  // title is present when the titled events read succeeded; absent/empty on
  // the anonymous freebusy fallback, where the UI shows "Busy".
  busy: { start: string; end: string; title?: string }[];
}

// One search hit from functions/api/admin/setter/contacts.ts, already shaped
// down to what the booking panel renders. `name` is never empty: the route
// falls back to the phone number and then to "Unknown contact", so a setter
// searching by number still recognizes the row they get back.
export interface ApiSetterContact {
  id: string;
  name: string;
  phone: string;
  email: string;
}

// One row of the inbox thread list (functions/api/admin/setter/inbox/index.ts).
// Deliberately thin: the list cannot afford a per-thread fetch, so a row
// carries only what it renders and the full thread loads on selection.
export interface ApiSetterThread {
  contactId: string;
  name: string;
  preview: string;
  lastMessageAt: string;
  lastMessageType: string;
  unreadCount: number;
  // Where this person sits in the CRM right now, or null when they hold no
  // opportunity at all. The inbox groups its list on this so a setter can see
  // whether a thread is a live lead, a booked job or somebody outside every
  // pipeline without opening the board.
  pipelineId: string | null;
  pipelineName: string | null;
  stageName: string | null;
  // Channels this contact has switched off, or null when their record was not
  // in the roster the server read. null is NOT an all-clear and must never be
  // rendered as one: the app only ever asserts a block it actually saw.
  dnd: ApiContactDnd | null;
}

// Do Not Disturb as the CRM holds it: a contact-level switch plus independent
// per-channel blocks. The per-channel form is the common one (GHL sets it
// automatically when a carrier rejects the number), and the flat switch stays
// false through all of it, so both have to be read.
export interface ApiContactDnd {
  // Every channel is off.
  all: boolean;
  // Channels individually off, in GHL's casing ("SMS", "Email", "Call", ...).
  channels: string[];
  // GHL's own reason per channel where it gave one, e.g. a raw Twilio error
  // code. Left verbatim: guessing at what a carrier rejection means is worse
  // than showing the code an operator can look up.
  reasons: Record<string, string>;
}

export interface ApiSetterInboxResponse {
  threads: ApiSetterThread[];
  // Non-null when more threads exist beyond the current window. The client
  // grows its window rather than consuming this as an offset (see
  // useSetterInboxQuery for why an offset silently skips rows).
  nextCursor: string | null;
  // TRUE when the upstream read hit its page cap, so this is as far as we
  // looked rather than the whole inbox. The UI must not render a capped read
  // as a complete one: "no matches in the part we searched" and "no matches"
  // are different answers, and only one of them is safe to act on.
  truncated: boolean;
  // FALSE when the pipeline lookup failed outright. Every thread then carries
  // a null placement for a reason that has nothing to do with the contacts, so
  // the list must fall back to one ungrouped run rather than filing the whole
  // inbox under "Not in a pipeline".
  placementAvailable: boolean;
  // FALSE when the opportunity read hit its page cap, so some contacts may
  // hold a pipeline place we never saw. The "Not in a pipeline" group has to
  // say so instead of asserting it.
  placementComplete: boolean;
}

// One message in a thread (functions/api/admin/setter/inbox/[contactId].ts).
export interface ApiSetterMessage {
  id: string;
  direction: string;
  channel: string;
  body: string;
  sentAt: string;
}

export interface ApiSetterThreadResponse {
  contactId: string;
  name: string;
  messages: ApiSetterMessage[];
  // Read from the contact record the send itself will hit, so the composer
  // warns off the authoritative copy rather than the list's.
  dnd: ApiContactDnd | null;
}

// One row of admin_audit_log (functions/api/admin/audit.ts). adminName is the
// signed-in ADMIN ACCOUNT, not a person: there are no per-setter accounts, so
// every setter's action attributes to whoever's account was used. The viewer
// must say so rather than implying per-person attribution.
export interface ApiAuditEntry {
  id: string;
  createdAt: string;
  adminId: string | null;
  adminName: string | null;
  adminEmail: string | null;
  action: string;
  tenantId: string | null;
  tenantName: string | null;
  payload: unknown;
}

export interface ApiAuditResponse {
  entries: ApiAuditEntry[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// The agency's own GoHighLevel booking (Cold Call). Distinct from the Setter
// Suite's per-client booking: one account, no tenantId, credentials from the
// environment. See functions/lib/agencyGhl.ts.
export interface AgencyCalendar {
  id: string;
  name: string;
}

export interface AgencySlotDay {
  date: string; // "YYYY-MM-DD"
  slots: string[]; // ISO datetimes with offset
}

export async function getColdCallCalendars(): Promise<{
  configured: boolean;
  calendars: AgencyCalendar[];
}> {
  return api("/api/admin/cold-call/calendars");
}

export async function getColdCallSlots(
  calendarId: string,
  days = 14,
): Promise<{ days: AgencySlotDay[]; timezone: string }> {
  return api(
    `/api/admin/cold-call/slots?calendarId=${encodeURIComponent(calendarId)}&days=${days}`,
  );
}

export interface ColdCallBookResult {
  ok: true;
  appointmentId: string;
  contactId: string;
  appointmentDate: string;
  leadUpdated: boolean;
}

export async function bookColdCall(input: {
  leadId: string;
  calendarId: string;
  startTime: string;
  endTime: string;
  // Who the meeting is with, as typed on the call. A scraped prospect is a
  // business with no person on it, so these are usually learned on the phone.
  //
  // Sent RAW. The server normalises and validates them (bookingContact.ts) and
  // writes back only what changed; a blank field means leave the stored value
  // alone rather than clear it.
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
}): Promise<ColdCallBookResult> {
  return api("/api/admin/cold-call/book", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// Every callback already promised, agency-wide, so the picker can refuse to
// agree two prospects the same time. See functions/api/admin/cold-call/callback-slots.ts.
export async function getColdCallCallbackSlots(): Promise<{
  taken: { leadId: string; date: string; time: string; name: string }[];
}> {
  return api("/api/admin/cold-call/callback-slots");
}

// The agency's own GoHighLevel boards (Cold Call > Pipelines), read live.
export interface AgencyPipeline {
  id: string;
  name: string;
  stages: { id: string; name: string }[];
}

export interface AgencyPipelineCard {
  id: string;
  name: string;
  stageId: string;
  status: string;
  value: number | null;
  contactId: string | null;
  phone: string;
  email: string;
  tags: string[];
  updatedAt: string | null;
}

export interface AgencyPipelinesResponse {
  // False when the agency GHL account is not connected at all.
  configured: boolean;
  pipelines: AgencyPipeline[];
  // Only when a pipeline id was asked for.
  opportunities?: AgencyPipelineCard[];
}

export async function getAgencyPipelines(
  pipelineId?: string,
): Promise<AgencyPipelinesResponse> {
  return api(
    "/api/admin/cold-call/pipelines" +
      (pipelineId ? `?id=${encodeURIComponent(pipelineId)}` : ""),
  );
}

// One attempt, appended the moment an outcome is pressed (0052). The server
// decides the caller (always the session), the day and what the outcome counts
// as, so this carries only what it alone knows: which prospect, and how it went.
// Mirrors DIAL_OUTCOMES in functions/lib/coldCallDials.ts and the CHECK
// constraint in migration 0078. The three nos differ by how far the call got:
// only "pitch_no" reached the pitch, and only it counts toward pass-through.
export type ColdCallDialOutcome =
  | "no_answer"
  | "not_qualified"
  | "opener_no"
  | "pitch_no"
  | "callback"
  | "booked";

export async function logColdCallDial(input: {
  leadId: string | null;
  outcome: ColdCallDialOutcome;
  note?: string;
  // Sent with a callback: it becomes a task on the contact in GoHighLevel, due
  // at the agreed time.
  followUpDate?: string;
  // The agreed time on that date, "HH:MM" (0064). Omitted means no time was
  // agreed, and the GHL task falls back to 9am.
  followUpTime?: string;
  // Which dialing variation was on screen (0058). The server checks it names a
  // live script and drops it if not, so this is a claim rather than a fact
  // until it gets there.
  scriptId?: string | null;
}): Promise<{
  dial: { id: string; day: string; outcome: string };
  // What the push to GoHighLevel did, or null when the account is not connected.
  ghl: { ok: boolean; error: string | null } | null;
}> {
  return api("/api/admin/cold-call/dials", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// The cold caller's shelf (0058): dialing script variations, and everything
// else read mid-call under headings Jake names himself.
export interface ColdCallAsset {
  id: string;
  // "script" is a variation of the pitch and the unit of the A/B test.
  // "sop" is how the job is done, read before and between calls (0061).
  // "objections" is the one document reached for mid-sentence; it renders inside
  // the script panel rather than behind a button of its own (0077).
  // "asset" was the call shelf. Retired in 0077 and only ever seen on an
  // archived row; nothing creates one.
  kind: "script" | "sop" | "objections" | "asset";
  category: string;
  // The stored markup. Only the document when driveFileId is null: a row with a
  // Drive pointer renders that instead, and this is the pre-0077 fallback.
  html: string;
  name: string;
  // The Google Drive file this row points at, in the agency's SOP folder, or
  // null when the words still live in `html`. Rendered through the SOP Hub's own
  // endpoint, so a script and an SOP are read through exactly one code path.
  driveFileId: string | null;
  // The Drive title as it was when picked. Display only; driveFileId is identity.
  driveTitle: string | null;
  sortOrder: number;
  archivedAt: string | null;
  updatedAt: string;
  // Only a script carries numbers, and they are derived from recorded dials on
  // every read, never stored. bookingRate is null below the sample floor: see
  // MIN_DIALS_FOR_RATE in functions/lib/coldCallAssets.ts.
  stats: {
    dials: number;
    pickups: number;
    booked: number;
    bookingRate: number | null;
  } | null;
}

export async function getColdCallAssets(
  includeArchived = false,
): Promise<{ assets: ColdCallAsset[] }> {
  return api("/api/admin/cold-call/assets" + (includeArchived ? "?archived=1" : ""));
}

export async function createColdCallAsset(input: {
  kind: "script" | "sop" | "objections";
  name: string;
  category?: string;
  html?: string;
  driveFileId?: string | null;
  driveTitle?: string | null;
}): Promise<{ asset: ColdCallAsset }> {
  return api("/api/admin/cold-call/assets", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// Only the fields sent are touched, so the autosaving editor can PATCH html
// alone without disturbing a name being edited elsewhere on the page.
export async function updateColdCallAsset(input: {
  id: string;
  name?: string;
  category?: string;
  html?: string;
  // A Drive file id to render from, or null to fall back to the stored html.
  // Omit to leave the pointer exactly as it is: sending undefined and sending
  // null mean different things on the server.
  driveFileId?: string | null;
  driveTitle?: string | null;
  sortOrder?: number;
  archived?: boolean;
}): Promise<{ asset: ColdCallAsset }> {
  return api("/api/admin/cold-call/assets", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

// Refused with a 409 when recorded dials name this script; archive it instead,
// so the test it ran survives.
export async function deleteColdCallAsset(id: string): Promise<{ ok: true }> {
  return api("/api/admin/cold-call/assets", {
    method: "DELETE",
    body: JSON.stringify({ id }),
  });
}

// ===== Sales > Playbook (0074) =====
//
// The prompts worked through on Sales > On Call. Plain text throughout: the
// pages render prompt and hint as text, never as markup, which is why there is
// no html field anywhere near this.

export type { PlaybookItem, PlaybookCategory } from "../../functions/lib/salesPlaybook";

type ApiPlaybookItem = import("../../functions/lib/salesPlaybook").PlaybookItem;
type ApiPlaybookCategory = import("../../functions/lib/salesPlaybook").PlaybookCategory;

// The prompts and the headings above them come back on one read: no page wants
// one without the other.
export async function getSalesPlaybook(
  includeArchived = false,
): Promise<{ items: ApiPlaybookItem[]; categories: ApiPlaybookCategory[] }> {
  return api("/api/admin/sales/playbook" + (includeArchived ? "?archived=1" : ""));
}

export async function createSalesPlaybookItem(input: {
  section: string;
  // Absent means a question, which is what every row was before 0082.
  kind?: string;
  prompt: string;
  hint?: string;
  // The name the answer is filed under, so a later prompt can say {avg_ticket}.
  answerKey?: string | null;
  // Calc rows only: arithmetic over other keys.
  formula?: string;
  format?: string;
  categoryId?: string | null;
}): Promise<{ item: ApiPlaybookItem }> {
  return api("/api/admin/sales/playbook", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateSalesPlaybookItem(input: {
  id: string;
  kind?: string;
  prompt?: string;
  hint?: string;
  // null clears the key. Leaving it out leaves the key alone.
  answerKey?: string | null;
  formula?: string;
  format?: string;
  sortOrder?: number;
  // null unfiles it; leaving the key out leaves the filing alone.
  categoryId?: string | null;
  archived?: boolean;
}): Promise<{ item: ApiPlaybookItem }> {
  return api("/api/admin/sales/playbook", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

// ===== The headings inside a column (0075) =====

export async function createSalesPlaybookCategory(input: {
  section: string;
  name: string;
}): Promise<{ category: ApiPlaybookCategory }> {
  return api("/api/admin/sales/playbook/categories", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateSalesPlaybookCategory(input: {
  id: string;
  name?: string;
  sortOrder?: number;
}): Promise<{ category: ApiPlaybookCategory }> {
  return api("/api/admin/sales/playbook/categories", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

// Removes the heading only. The prompts under it fall loose to the bottom of
// the same column, still on the call.
export async function deleteSalesPlaybookCategory(id: string): Promise<{ ok: true }> {
  return api("/api/admin/sales/playbook/categories", {
    method: "DELETE",
    body: JSON.stringify({ id }),
  });
}

// A real delete, for the prompt added by mistake. Retiring is the softer move
// and the page offers it first.
export async function deleteSalesPlaybookItem(id: string): Promise<{ ok: true }> {
  return api("/api/admin/sales/playbook", {
    method: "DELETE",
    body: JSON.stringify({ id }),
  });
}

// A booked meeting and what became of it (0057). Created by the booking itself;
// the outcome is filled in afterwards, by whoever ran the call.
export interface SalesMeeting {
  id: string;
  appointmentId: string;
  leadId: string | null;
  prospectName: string;
  businessName: string;
  phone: string;
  email: string;
  scheduledAt: string | null;
  appointmentStatus: string;
  // Which calendar the meeting was booked under (0066). Null on meetings
  // recorded before that, until the next calendar read fills them in.
  calendarId: string | null;
  calendarName: string | null;
  // Null until somebody says what happened. See functions/lib/salesCalls.ts.
  // See functions/lib/salesCalls.ts. not_interested is "heard it, said no" and
  // stays qualified; not_qualified is "never a prospect". Named after the tags
  // the live automation listens for (0067).
  outcome: "closed" | "follow_up" | "not_interested" | "not_qualified" | "no_show" | null;
  // Why they said no, on either kind of no: a key from SALES_NO_REASONS
  // (functions/lib/salesCalls.ts), null on every other outcome.
  reason: string | null;
  // The same value under its original name, kept while anything still reads it.
  notAFitReason: string | null;
  followUpAt: string | null;
  // Money taken on the call itself. What the client is worth every month is the
  // deal below; the two are different questions and are counted apart.
  cashCollected: number | null;
  // The retainer sold on a close: dollars a month, and the term where one was
  // agreed. Null on anything that did not close, and on a close recorded without
  // the figures.
  deal: { monthly: number; months: number | null } | null;
  // Which offer was put on the table, and the numbers actually quoted inside
  // its range (0086). Null on a no-show, and on any call recorded before it or
  // recorded without an offer picked. The variant is an id from
  // functions/lib/salesOffers.ts.
  offer: { variant: string; terms: Record<string, number> } | null;
  // Whatever was said on the call. "" when nothing was typed.
  notes: string;
  assignedTo: string | null;
  // Who set the appointment (0073), by name. Null on a meeting the sync adopted
  // off the calendar, which nobody set from inside this app.
  bookedBy: string | null;
  bookedById: string | null;
  updatedAt: string;
  // Where this meeting came from: "Cold call" when the app booked it, "Calendar"
  // when the sync adopted one nobody typed here (0060).
  source: string;
  contactId: string | null;
  // The card on the agency Sales Pipeline, and where the app last put it. Null
  // means the meeting has never been pushed.
  opportunityId: string | null;
  crmStage: string | null;
  // The sc tag the app applied for this meeting. What actually drives the
  // board: a workflow of Jake's reads it and moves the card. crmStage is
  // historic, from when the app moved cards itself.
  crmTag: string | null;
  // Why the last push did not land, in words. Null when it did.
  crmError: string | null;
  syncedAt: string | null;
}

// The Sales section's view: every meeting on the sales calendars, whoever
// booked it, plus what the last calendar read did and which board the outcomes
// route to.
export interface SalesCallsResponse {
  meetings: SalesMeeting[];
  configured: boolean;
  sync: (SalesCallSyncResult & { ok: true }) | { ok: false; error: string } | null;
  pipeline: { id: string; name: string; missing: string[] } | null;
}

// `sync: false` reads what is stored without re-reading the calendars. Used
// straight after recording an outcome, where two calendar round trips to redraw
// one row is a wait nobody asked for.
export async function getSalesCalls(sync = true): Promise<SalesCallsResponse> {
  return api("/api/admin/sales/calls" + (sync ? "" : "?sync=0"));
}

// Sales > Sales Pipeline: the agency's own Sales board, read live and read
// only. Reuses the card shape Cold Call > Pipelines already publishes
// (AgencyPipelineCard), because it is the same account and the same board type.
export interface SalesPipelineColumn {
  id: string;
  name: string;
  cards: AgencyPipelineCard[];
}

export interface SalesPipelineResponse {
  // False when the agency GoHighLevel account is not connected at all.
  configured: boolean;
  // Null when connected but no board on the account answers to "Sales".
  pipeline: {
    id: string;
    name: string;
    // Stages the console can write that this board has no column for.
    missing: string[];
  } | null;
  locationId?: string;
  columns: SalesPipelineColumn[];
  // True when the card fetch hit its page cap, so the board is showing some of
  // the deals rather than all of them.
  truncated: boolean;
}

export async function getSalesPipeline(): Promise<SalesPipelineResponse> {
  return api("/api/admin/sales/pipeline");
}

export async function recordSalesCallOutcome(input: {
  id: string;
  outcome: NonNullable<SalesMeeting["outcome"]>;
  // Required by both kinds of no; the server refuses one without it.
  reason?: string;
  followUpAt?: string;
  cashCollected?: number | null;
  // The retainer, on a close. A monthly with no term is month-to-month.
  monthly?: number | null;
  months?: number | null;
  // Which offer was pitched, and the numbers quoted inside its range. Kept on
  // every outcome where they turned up, including the nos.
  offerVariant?: string | null;
  offerTerms?: Record<string, number>;
  notes?: string;
}): Promise<{ meeting: SalesMeeting }> {
  return api("/api/admin/sales/calls", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function getSalesMeetings(callerId?: string): Promise<{
  meetings: SalesMeeting[];
}> {
  return api(
    "/api/admin/cold-call/meetings" +
      (callerId ? `?callerId=${encodeURIComponent(callerId)}` : ""),
  );
}

// Record what one meeting became. `showed` is deliberately absent: the server
// derives it from the outcome, so a show rate cannot be typed.
//
// Same shape as recordSalesCallOutcome above, because it is the same record seen
// from the caller's end and both land in the one shared handler
// (functions/api/lib/recordSalesCall.ts). The two pages must ask for identical
// facts or a meeting would carry different detail depending on who answered it.
export async function recordMeetingOutcome(input: {
  id: string;
  outcome: NonNullable<SalesMeeting["outcome"]>;
  reason?: string;
  followUpAt?: string;
  cashCollected?: number | null;
  monthly?: number | null;
  months?: number | null;
  offerVariant?: string | null;
  offerTerms?: Record<string, number>;
  notes?: string;
}): Promise<{ meeting: SalesMeeting }> {
  return api("/api/admin/cold-call/meetings", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
