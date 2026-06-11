export type Role = "owner" | "manager" | "rep";

// Opportunity status is a first-class GHL field. Stages are real pipeline
// stages identified by id; the app never guesses meaning from stage names.
export type LeadStatus = "open" | "won" | "lost" | "abandoned";

export interface Brand {
  color: string;
  logoUrl: string | null;
  initials: string;
  appName: string;
}

export interface PipelineConfig {
  wonLabel: string;
  valueLabel: string;
}

export interface Client {
  id: string;
  name: string;
  niche: string;
  brand: Brand;
  pipeline: PipelineConfig;
  tier: "core" | "pro" | "premium";
  monthlySpend: number;
}

export interface User {
  id: string;
  clientId: string;
  name: string;
  email: string;
  role: Role;
}

export interface Lead {
  id: string;
  clientId: string;
  assignedUserId: string | null;
  // GHL contact id behind the opportunity; notes/tasks key off this. Absent in mock data.
  contactId?: string;
  name: string;
  phone: string;
  email: string;
  sourceAd: string;
  sourceCampaign: string;
  pipelineId: string;
  pipelineStageId: string;
  status: LeadStatus;
  // Display fields resolved against the pipelines list. stagePosition is the
  // stage's index within its own pipeline, or -1 if the pipeline/stage is
  // unknown (deleted in GHL, stale cache); render "Unknown stage" then.
  stageName: string;
  stagePosition: number;
  pipelineName: string;
  value: number | null;
  createdAt: string;
  lastActivityAt: string;
  notes: string | null;
}

export type LeadActivityKind =
  | "created"
  | "stage-change"
  | "note"
  | "won-recorded";

export interface LeadActivity {
  id: string;
  leadId: string;
  kind: LeadActivityKind;
  at: number; // epoch ms
  authorUserId?: string;
  // for stage-change: display names ("Estimate Sent", "Won"), never ids
  fromStage?: string;
  toStage?: string;
  // for note:
  body?: string;
  // for won-recorded:
  value?: number;
}

export interface Stats {
  leadsMtd: number;
  // Open leads created MTD that advanced beyond their pipeline's first stage,
  // plus wins. Replaces the old keyword-derived "booked" count.
  progressedMtd: number;
  // Open leads created MTD still sitting in their pipeline's first stage.
  newMtd: number;
  wonMtd: number;
  revenueMtd: number;
  spendMtd: number;
  cpa: number | null;
  roas: number | null;
}
