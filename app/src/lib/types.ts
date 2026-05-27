export type AppConfig = {
  media_buying_path: string | null;
  active_client_slug?: string | null;
  default_agent_slug?: string | null;
  /** Agency-wide Google Drive folder URL that holds SOP docs. */
  sops_drive_folder_url?: string | null;
  /** Agency-wide Drive folder that holds every client's subfolder. Used by
   *  the per-client Drive picker to enumerate subfolders for selection. */
  agency_drive_folder_url?: string | null;
  /** Google AI Studio API key for Nano Banana 2 image generation (legacy). */
  gemini_api_key?: string | null;
  /** Replicate API token. Powers the Creative Studio playground. */
  replicate_api_token?: string | null;
};

/** Replicate model summary returned by search_replicate_models. */
export type ReplicateModel = {
  owner: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  latest_version_id: string | null;
  run_count: number | null;
};

/** Replicate model details including OpenAPI input schema. */
export type ReplicateModelDetail = {
  owner: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  latest_version_id: string | null;
  input_schema: Record<string, unknown>;
};

/** Result of a Replicate prediction. */
export type ReplicatePredictionResult = {
  id: string;
  status: string;
  output: unknown;
  error: string | null;
  logs: string | null;
};

/** Saved Replicate output file. */
export type ReplicateSavedOutput = {
  saved_path: string;
  filename: string;
  source_url: string;
};

/** Nano Banana 2 prompt shape consumed by `generate_creative_set`. */
export type CreativePrompt = {
  filename: string;
  aspect_ratio: string;
  prompt: string;
};

export type CreativeImageResult = {
  filename: string;
  saved_path: string;
  aspect_ratio: string;
};

export type CreativeBatchError = {
  filename: string;
  error: string;
};

export type CreativeBatchResult = {
  saved: CreativeImageResult[];
  errors: CreativeBatchError[];
};

export type AgentSummary = {
  slug: string;
  name: string;
  initial: string;
  short: string;
  role: string | null;
  description: string | null;
  path: string;
};

export type ChatSummary = {
  slug: string;
  title: string;
  agent: string | null;
  started_at: string | null;
  modified_at: string;
  preview: string | null;
  path: string;
};

export type FolderSummary = {
  root: string;
  agents: AgentSummary[];
  chats: ChatSummary[];
  knowledge_count: number;
  skill_count: number;
};

export type ChatTurn = {
  role: "user" | "agent";
  agent: string | null;
  at: string;
  body: string;
};

export type ChatFile = {
  path: string;
  slug: string;
  title: string;
  agent: string | null;
  client?: string | null;
  started_at: string;
  turns: ChatTurn[];
};

/** One entry in the chat right-rail conversation history. */
export type ChatHistoryItem = {
  path: string;
  title: string;
  agent: string | null;
  started_at: string;
  turns: number;
};

/** A global copy-paste prompt template (right-rail "Prompts" tab). */
export type SavedPrompt = {
  id: string;
  title: string;
  body: string;
};

export type ClaudeCheck = {
  found: boolean;
  path: string | null;
  version: string | null;
  error: string | null;
};

export type StreamEvent =
  | { kind: "started"; id: string }
  | { kind: "delta"; id: string; text: string }
  | { kind: "done"; id: string; full_text: string }
  | { kind: "error"; id: string; message: string };

export type KnowledgeChunk = {
  id: string;
  title: string;
  tags: string[];
  body: string;
  path: string;
};

export type NoteFront = {
  id?: string | null;
  title?: string | null;
  type?: string | null;
  client?: string | null;
  agent?: string | null;
  tags?: string[];
  subject?: string | null;
  status?: string | null;
  [key: string]: unknown;
};

export type VaultNote = {
  path: string;
  rel_path: string;
  front: NoteFront;
  body: string;
};

export type KnowledgeQuery = {
  client?: string | null;
  agent?: string | null;
  tags?: string[];
  limit?: number | null;
};

export type SkillInput = {
  name: string;
  label: string | null;
  prompt: string | null;
  default: string | null;
};

export type SkillFile = {
  id: string;
  name: string;
  description: string | null;
  primary_agent: string | null;
  category: string;
  body: string;
  inputs: SkillInput[];
  path: string;
};

export type SkillEntry = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  activation_command: string | null;
  skill_path: string;
};

export type KnowledgeTitle = {
  id: string;
  title: string;
  path: string;
};

export interface OnboardingState {
  done: string[];
  /** Optional task IDs the user marked "N/A" — rendered crossed out and
   *  ignored for completion. Required tasks should never appear here. */
  skippedOptional?: string[];
  /** Phase number (as string) → human-readable completion date (e.g. "12 MAY"). */
  phaseDoneAt: Record<string, string>;
  /** ISO-8601 timestamp stamped by the backend on every write. */
  updatedAt?: string;
  /** Optional Media Buying Sequence state. Shape defined in
   *  app/src/lib/mediaBuyingSequence.ts (`SequenceState`). Stored loosely-typed
   *  here so the backend write/read path stays schema-agnostic. */
  sequence?: {
    currentStep: string;
    stepOutputs: Record<string, { path: string; completedAt: string }>;
    skipped?: string[];
    launchedAt?: string;
    driveFolderId?: string;
    /** Set when the Onboarding Sequence Wizard's "Mark launched" button fires.
     *  When true, the Sequence tab on the Client Hub disappears. */
    sequenceComplete?: boolean;
    /** Editable campaign skeleton from CampaignTreeView. Loosely typed here;
     *  the canonical shape is `CampaignSkeleton` in mediaBuyingSequence.ts.
     *  Stored so the wizard's tree edits + standalone pick-overlay drops
     *  survive reload. */
    campaignSkeleton?: unknown;
  };
}

export type ClientStatus = "pre-launch" | "live" | "paused";

export type ClientEntry = {
  slug: string;
  name: string;
  status: ClientStatus;
  created_at?: string | null;
  /** Filename (no path) of the chosen benchmarks YAML. Null/undefined = use
   * the hardcoded card metadata fallback in Kpis.tsx. */
  benchmarks?: string | null;
  /** URL to this client's Google Drive folder. */
  drive_folder_url?: string | null;
  /** URL of this client's Google Sheet (their copy of the ad-copy template),
   *  picked from the Drive folder via the Ads Sequence "Sheet" tab. */
  google_sheet_url?: string | null;
  /** Title of the tab inside `google_sheet_url` holding manual competitor
   *  research / customer reviews. When set, the copywriter chat auto-reads it
   *  and injects it into every prompt. Picked in the Ads Sequence "Sheet" tab. */
  google_sheet_research_tab?: string | null;
  /** Meta Marketing API ad account ID (`act_…` or bare digits). When set,
   *  AdsManagerPage swaps the mock generator for real insights. */
  meta_ad_account_id?: string | null;
  /** Override the conversion-action allowlist for this client. Single Meta
   *  `action_type` string. When set, only that action counts as a "Result". */
  meta_conversion_action?: string | null;
  /** Per-kind default Drive folder targets for the in-app documents system.
   *  Populated via the Documents tab's "Default folders" card. */
  doc_folder_defaults?: DocFolderDefaults | null;
  /** Per-step default Drive folder targets for the Ads Sequence wizard's
   *  auto-push. Configured via the gear modal on the Ads Sequence topbar. */
  sequence_folder_defaults?: SequenceFolderDefaults | null;
  /** Average customer value in USD (LTV). Drives the derived target CPA the
   *  optimizer uses: target_cpa = avg_customer_value / target_roas. Unset
   *  means the optimizer skips this client. */
  avg_customer_value?: number | null;
  /** Target ROAS multiple. When null/unset, defaults to 3.0 (the lesson 3.2
   *  "client is happy" floor). */
  target_roas?: number | null;
  /** Manual override of the computed target CPA in USD. Wins over the
   *  LTV-based math when set. Rare — for niches where the formula doesn't
   *  fit. */
  target_cpa_override?: number | null;
  /** Optimizer mode. `off` (or unset) skips the client. `suggest` runs the
   *  6-hour decision loop and writes verdicts to the Recommendations panel
   *  without auto-executing. */
  optimizer_mode?: OptimizerMode | null;
};

export type OptimizerMode = "off" | "suggest";

/** Per-ad snapshot row written to vault/Clients/<Name>/ads-log/YYYY-MM.csv. */
export interface AdsLogRow {
  ts: string;
  date: string;
  adId: string;
  adName: string;
  campaignId: string;
  campaignName: string;
  adSetId: string;
  adSetName: string;
  spend: number;
  results: number;
  cpl: number;
  ctr: number;
  cpm: number;
  frequency: number;
  ageHours: number;
  parentAdSetBudget: number;
  verdict: string;
  verdictReason: string;
  actionTaken: string;
}

// ── Per-client documents (in-app + Drive sync) ────────────────

export type DocKind = "ad-copy" | "brief" | "notes" | "report" | "other";

export interface DocFolderTarget {
  id: string;
  name: string;
}

export interface DocFolderDefaults {
  "ad-copy"?: DocFolderTarget;
  brief?: DocFolderTarget;
  notes?: DocFolderTarget;
  report?: DocFolderTarget;
  other?: DocFolderTarget;
}

/** Per-step default Drive folder targets for the Ads Sequence wizard's
 *  auto-push. Keys match `SequenceStepId` from mediaBuyingSequence.ts.
 *  Every entry is optional; unset steps fall back to doc_folder_defaults
 *  (mapped by kind) and finally the client root. */
export interface SequenceFolderDefaults {
  "audience-research"?: DocFolderTarget;
  "creative-brief"?: DocFolderTarget;
  "ad-copy"?: DocFolderTarget;
  "ad-creative"?: DocFolderTarget;
  structure?: DocFolderTarget;
}

/** Result of pushing a sequence step's saved output to Drive. */
export interface SequencePushResult {
  docId: string;
  driveUrl: string;
  driveFileId: string;
  folderId: string;
  folderName: string | null;
}

/** Result of uploading a native binary file to Drive (PNG, etc.). */
export interface UploadedFile {
  fileId: string;
  webViewLink: string;
  mimeType: string;
  name: string;
}

export interface DocSummary {
  id: string;
  title: string;
  kind: DocKind;
  clientSlug: string;
  createdAt: string;
  updatedAt: string;
  syncedAt: string | null;
  currentDriveUrl: string | null;
  currentDriveFileId: string | null;
  currentVersion: number;
  isDirty: boolean;
  driveFolderId: string | null;
  driveFolderName: string | null;
  unsweptOrphanCount: number;
}

export interface ClientDoc extends DocSummary {
  body: string;
}

export interface DocSummaryWithClient extends DocSummary {
  clientName: string;
}

export interface CreateDocPayload {
  title: string;
  kind: DocKind;
  body?: string;
  driveFolderId?: string;
  driveFolderName?: string;
}

export type DriveIndex = {
  client: string;
  drive_folder_url: string | null;
  updated_at: string;
  body: string;
  path: string;
};

export type DriveSubfolder = {
  id: string;
  name: string;
  webViewLink: string;
};

export type DriveSheet = {
  id: string;
  name: string;
  /** The Sheets editor URL (docs.google.com/spreadsheets/d/<id>/edit). */
  webViewLink: string;
};

export type DriveUploadResult = {
  doc_url: string;
  doc_id: string | null;
  filename: string;
};

export type BenchmarkSummary = {
  filename: string;
  title: string;
};

export type ParsedBenchmarks = {
  spend_cap?: string | null;
  cpm_band?: string | null;
  ctr_band?: string | null;
  cvr_band?: string | null;
  cpa_band?: string | null;
  roas_band?: string | null;
};

export type KpiWindow = "7d" | "14d" | "28d";

export type KpiEntry = {
  client: string;
  date: string;
  window: KpiWindow;
  spend: number | null;
  cpm: number | null;
  ctr: number | null;
  cvr: number | null;
  cpa: number | null;
  roas: number | null;
  updated_at: string;
};

export type TrackingStatus = "ok" | "warning" | "missing";

export type TrackingAudit = {
  client: string;
  pixel_status: TrackingStatus;
  capi_status: TrackingStatus;
  emq_score: number | null;
  pulse_note: string | null;
  updated_at: string;
};

export type MetaCredentials = {
  access_token: string | null;
  ad_account_id: string | null;
  pixel_id: string | null;
  business_id: string | null;
};

export type ClientCredentialsFile = {
  client: string;
  meta: MetaCredentials;
  updated_at: string | null;
};

export type CreativeSignal = "go" | "hold" | "stop";

export type CreativeVariant = {
  id: string;
  name: string;
  signal: CreativeSignal;
};

export type CreativesManifest = {
  client: string;
  min_active: number;
  creatives: CreativeVariant[];
  updated_at: string;
};

export type DiagnosisVerdict = "kill" | "hold" | "scale";

export type DiagnosisFindingSeverity = "high" | "med" | "low";

export type DiagnosisFinding = {
  severity: DiagnosisFindingSeverity;
  attribution: string;
  body: string;
};

export type DiagnosisInputs = {
  spend: number | null;
  cpm: number | null;
  ctr: number | null;
  cvr: number | null;
  cpa: number | null;
  roas: number | null;
  frequency: number | null;
  creatives_active: number | null;
  paste_dump: string | null;
};

export type DiagnosisFile = {
  client: string;
  created_at: string;
  verdict: DiagnosisVerdict;
  scale_score: number;
  headline: string;
  body: string;
  findings: DiagnosisFinding[];
  inputs: DiagnosisInputs;
  transcript: string;
  path: string;
};

export type DataKind =
  | "diagnosis"
  | "kpi"
  | "tracking"
  | "creatives"
  | "onboarding"
  | "chat"
  | "client"
  | "hooks"
  | "briefs"
  | "reports"
  | "scale_checks"
  | "audits"
  | "workflows"
  | "dashboard_state"
  | "vault"
  | "activity";

export type GeneratorKind =
  | "hooks"
  | "briefs"
  | "reports"
  | "scale_checks"
  | "audits"
  | "workflows"
  | "html";

export type GeneratorOutput = {
  kind: GeneratorKind;
  client: string;
  created_at: string;
  title: string;
  summary: string | null;
  inputs_yaml: string | null;
  body: string;
  path: string;
};

export type SaveGeneratorOutputArgs = {
  root: string;
  clientSlug: string;
  kind: GeneratorKind;
  title: string;
  summary: string | null;
  body: string;
  inputsYaml: string | null;
};

export type DataChangedEvent = {
  kind: DataKind;
  client_slug: string | null;
  path: string | null;
};

export interface Task {
  id: string;
  title: string;
  done: boolean;
  createdAt: number;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
}

export interface CalendarConnection {
  apiKey: string;
  calendarId: string;
  label?: string | null;
  connectedAt: string;
}

export interface FathomRecording {
  id: string;
  url: string;
  title: string;
  description?: string;
  createdAt: number;
  /** Optional client slug — when set, this recording is scoped to one client.
   *  Recordings created from the global Workspace > Recordings tab leave this
   *  unset and behave like agency-wide entries. */
  clientSlug?: string | null;
}

/** A doc inside the user's Google Drive SOPs folder. */
export interface SopSummary {
  id: string;
  title: string;
  mimeType?: string | null;
  webViewLink?: string | null;
  modifiedTime?: string | null;
  folder?: string | null;
  /** True when the body has been fetched and cached on disk. */
  cached: boolean;
}

export interface SopsIndex {
  folderUrl: string | null;
  updatedAt: string | null;
  items: SopSummary[];
}

export interface SopFile {
  id: string;
  title: string;
  body: string;
  webViewLink?: string | null;
  fetchedAt: string;
}

export interface DashboardState {
  tasks: Task[];
  notes: Note[];
  calendar?: CalendarConnection | null;
  recordings?: FathomRecording[];
}

export interface ProspectFile {
  name: string;
  path: string;
  modified_unix: number;
  size_bytes: number;
}

export type ScraperEvent =
  | { kind: "started"; id: string }
  | { kind: "line"; id: string; text: string; stream: "stdout" | "stderr" }
  | { kind: "done"; id: string; exit_code: number; csv_path: string | null }
  | { kind: "error"; id: string; message: string };

export interface WebsiteFile {
  name: string;
  path: string;
  modified_unix: number;
  size_bytes: number;
  mode: "build" | "revamp";
}

export type WebDesignerEvent =
  | { kind: "started"; id: string }
  | { kind: "delta"; id: string; text: string }
  | { kind: "done"; id: string; ok: boolean; path: string | null; message: string | null }
  | { kind: "error"; id: string; message: string };

export interface DmFile {
  name: string;
  path: string;
  modified_unix: number;
  size_bytes: number;
}

// ── GoHighLevel (Sales Hub + onboarding sync) ────────────────

export interface GhlStage {
  id: string;
  name: string;
  position: number;
}

export interface GhlPipeline {
  id: string;
  name: string;
  stages: GhlStage[];
}

export interface GhlOpportunity {
  id: string;
  name: string;
  contactId?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  pipelineId: string;
  pipelineStageId: string;
  status?: string | null;
  monetaryValue?: number | null;
  updatedAt?: string | null;
}

export interface GhlAdvanceArgs {
  clientName: string;
  clientEmail?: string | null;
  /** Preferred — pass the GHL pipeline ID to avoid name-based lookups. */
  pipelineId?: string | null;
  /** Fallback when pipelineId isn't known. Case-insensitive name match. */
  pipelineName?: string | null;
  stageName: string;
  knownContactId?: string | null;
  knownOpportunityId?: string | null;
}

export interface GhlConfigStatus {
  configured: boolean;
  locationId?: string | null;
  salesPipelineId?: string | null;
  onboardingPipelineId?: string | null;
  /** Single GHL calendar the app polls for new bookings. Drives the
   *  Call Booked → sales-pipeline + Google Calendar sync. */
  bookingCalendarId?: string | null;
}

/** Which hub a pipeline choice belongs to. */
export type GhlHubKey = "sales" | "onboarding";

export interface GhlAdvanceResult {
  contactId: string;
  opportunityId: string;
  pipelineId: string;
  stageId: string;
}

export interface GhlCalendar {
  id: string;
  name: string;
  isActive?: boolean | null;
  calendarType?: string | null;
}

export interface GhlAppointment {
  id: string;
  calendarId: string;
  /** "confirmed" | "cancelled" | "noshow" | "showed" | "invalid". */
  appointmentStatus: string;
  startIso: string;
  endIso: string;
  title?: string | null;
  contactId?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  dateUpdated?: string | null;
}

export interface GhlContactLite {
  id: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
}

// ── Ops trackers (Workspace > Dashboard) ──────────────────────

export interface OpsClientRow {
  retainer?: number | null;
  /** ISO date the contract was signed. Empty = "Contract due" flag on Client Hub. */
  contractSignedAt?: string | null;
  /** ISO date the first invoice was paid. Empty = "Invoice due" flag on Client Hub.
   *  When set, the Client Hub auto-fills {@link startDate} if it's empty —
   *  retainer start = "first cleared payment". */
  invoicePaidAt?: string | null;
  /** Retainer / contract start. Distinct from {@link adsLaunchedAt}. */
  startDate?: string | null;
  adSpend?: number | null;
  /** Date campaigns went live. Drives weekly + monthly report cadence. */
  adsLaunchedAt?: string | null;
  /** Legacy single-due column. New UI computes from {@link adsLaunchedAt}. */
  nextReportDue?: string | null;
  /** ISO date the most-recent weekly report was marked sent. */
  weeklyReportSentAt?: string | null;
  /** ISO date the most-recent monthly report was marked sent. */
  monthlyReportSentAt?: string | null;
  nextCall?: string | null;
  /** GCal event id when next call was sourced from the calendar. */
  nextCallEventId?: string | null;
  /** GoHighLevel contact ID — populated on first onboarding-stage sync. */
  ghlContactId?: string | null;
  /** GoHighLevel opportunity ID for the onboarding pipeline. */
  ghlOpportunityId?: string | null;
  notes?: string | null;
}

export interface OpsClientsFile {
  /** Keyed by client slug. */
  rows: Record<string, OpsClientRow>;
}

export type OpsTaskStatus = "todo" | "done";

/** Which tab the task lives in. Missing = "active" (legacy rows).
 *  "daily" tasks recur every day — their `status` is ignored; completion is
 *  tracked per-day via `lastCompletedDate` so the checkbox resets at midnight.
 *  "weekly" tasks recur every Monday — completion is tracked per-week via
 *  `lastCompletedWeek` (the Monday date of the active week). */
export type OpsTaskLane = "active" | "backburner" | "daily" | "weekly";

export interface OpsTask {
  id: string;
  title: string;
  /** null = agency-internal task (not tied to a real client). */
  clientSlug?: string | null;
  status: OpsTaskStatus;
  /** Defaults to "active" when undefined. */
  lane?: OpsTaskLane;
  createdAt: number;
  /** YYYY-MM-DD. Set when a `lane: "daily"` task is checked off; the box
   *  re-appears unchecked the next day. */
  lastCompletedDate?: string | null;
  /** YYYY-MM-DD of a Monday. Set when a `lane: "weekly"` task is checked off;
   *  the box re-appears unchecked when the next Monday arrives. */
  lastCompletedWeek?: string | null;
  /** Day of week a `lane: "weekly"` task is scheduled for. 0 = Sun … 6 = Sat.
   *  Defaults to 1 (Monday) when missing. The task surfaces in the main
   *  dashboard's Daily routine on this day each week. */
  weeklyDay?: number;
}

export interface OpsTasksFile {
  tasks: OpsTask[];
}

export interface OpsRevenueRow {
  /** ISO `YYYY-MM`. */
  month: string;
  revenue?: number | null;
  expenses?: number | null;
  /** Manual override for # of clients. Null → fall back to live count. */
  clientsOverride?: number | null;
  notes?: string | null;
}

export interface OpsRevenueFile {
  months: OpsRevenueRow[];
}

/** One GHL appointment synced into HML. Keyed by ghlAppointmentId in
 *  {@link OpsAppointmentsFile}. */
export interface OpsAppointmentRow {
  ghlAppointmentId: string;
  /** Google Calendar event ID created when this booking was synced. Used to
   *  update on reschedule and delete on cancel without duplicating. */
  gcalEventId?: string | null;
  /** Sales-pipeline opportunity advanced to "Call Booked" (or moved to
   *  "Call Canceled" on cancellation). */
  opportunityId?: string | null;
  contactId?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  startIso: string;
  endIso: string;
  /** "booked" | "cancelled". */
  status: string;
  calendarId: string;
  syncedAt: string;
  title?: string | null;
}

export interface OpsAppointmentsFile {
  /** Keyed by GHL appointment id. */
  appointments: Record<string, OpsAppointmentRow>;
}

export interface PersonalItem {
  id: string;
  name: string;
  url?: string | null;
  /** Cost in dollars. Null/undefined when unknown. */
  price?: number | null;
  notes?: string | null;
}

export interface PersonalCategory {
  id: string;
  name: string;
  items: PersonalItem[];
}

export interface PersonalSectionData {
  categories: PersonalCategory[];
}

export interface PersonalHubFile {
  hygiene: PersonalSectionData;
  clothing: PersonalSectionData;
}

export type CopywriterEvent =
  | { kind: "started"; id: string }
  | { kind: "delta"; id: string; text: string }
  | {
      kind: "done";
      id: string;
      ok: boolean;
      path: string | null;
      body: string | null;
      message: string | null;
    }
  | { kind: "error"; id: string; message: string };
