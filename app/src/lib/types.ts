export type AppConfig = {
  media_buying_path: string | null;
  active_client_slug?: string | null;
  default_agent_slug?: string | null;
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
  started_at: string;
  turns: ChatTurn[];
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

export type ChecklistStatus = "go" | "hold" | "stop";

export type ChecklistItem = {
  id: string;
  label: string;
  status: ChecklistStatus;
  note: string | null;
};

export type LaunchChecklist = {
  client: string;
  updated_at: string;
  items: ChecklistItem[];
};

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
};

export type DriveIndex = {
  client: string;
  drive_folder_url: string | null;
  updated_at: string;
  body: string;
  path: string;
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
  | "launch_checklist"
  | "chat"
  | "client"
  | "hooks"
  | "briefs"
  | "reports"
  | "scale_checks"
  | "audits"
  | "workflows";

export type GeneratorKind =
  | "hooks"
  | "briefs"
  | "reports"
  | "scale_checks"
  | "audits"
  | "workflows";

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
