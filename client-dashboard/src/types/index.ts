export type Role = "owner" | "manager" | "rep";

export type LeadStage =
  | "new"
  | "contacted"
  | "estimate-sent"
  | "consultation"
  | "booked"
  | "won"
  | "lost"
  | "no-show";

export interface Brand {
  color: string;
  logoUrl: string | null;
  initials: string;
  appName: string;
}

export interface PipelineConfig {
  stages: LeadStage[];
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
  name: string;
  phone: string;
  email: string;
  sourceAd: string;
  sourceCampaign: string;
  stage: LeadStage;
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
  // for stage-change:
  fromStage?: LeadStage;
  toStage?: LeadStage;
  // for note:
  body?: string;
  // for won-recorded:
  value?: number;
}

export interface Stats {
  leadsMtd: number;
  bookedMtd: number;
  wonMtd: number;
  revenueMtd: number;
  spendMtd: number;
  cpa: number | null;
  roas: number | null;
}
