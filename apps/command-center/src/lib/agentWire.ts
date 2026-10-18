// The shapes that cross the wire for the Agents section, in one place so the
// admin API (functions/api/admin/agents), the runner API
// (functions/api/agent-runner) and the page agree. projects/agent-runner keeps
// a copy of the runner half in src/wire.ts; change both together.
//
// Field names are camelCase on the wire; the tables (0166) are snake_case.

import type { AgentId } from "./agents";

export type MessageRole = "me" | "ai" | "request";
export type MessageStatus = "queued" | "running" | "done" | "error";
export type ItemStatus = "building" | "needs_ok" | "live" | "done" | "declined";
export type LessonScope = "client" | "agent" | "manager";

// What an Approve unlocks for the agent's next turn, and only that turn: a
// deploy (Landing Page), a credit spend up to `limit` (Creative), a GHL write
// (GHL), filing into an app page, an Ads Manager change (Ads, kind "meta").
// Copied by PATCH items/:id approve from the
// card's payload.grant onto the follow-up message; the runner and the server
// both check it before a gated action.
export type GrantKind = "deploy" | "spend" | "ghl" | "file" | "meta";
export interface Grant {
  itemId: string;
  kind: GrantKind;
  limit: number | null;
}

export interface ChatSummary {
  id: string;
  title: string;
  auto: boolean;
  // A request from another agent is waiting in this chat.
  hasRequest: boolean;
  lastLine: string;
  updatedAt: string;
}

export interface AgentMessage {
  id: string;
  chatId: string;
  role: MessageRole;
  body: string;
  status: MessageStatus;
  // ai: the steps it took, what it used from a brain, what it learned.
  tools: string[];
  used: string[];
  learned: string[];
  // request: the item it belongs to and who sent it.
  itemId: string | null;
  fromAgent: AgentId | null;
  // me: set on a follow-up created by Jake's click on a card (the card id),
  // and the grant when that click was Approve. Null on a message Jake typed.
  followUpOf: string | null;
  grant: Grant | null;
  // request: set on an answer, the request card it answers. Queued in the
  // asking agent's chat and run like Jake's message, but never role "me", so
  // no "Jake asked" gate (GHL writes, Meta changes) opens for it.
  answerOf: string | null;
  error: string | null;
  createdAt: string;
}

export interface AgentItem {
  id: string;
  tenantId: string | null;
  agent: AgentId;
  chatId: string | null;
  fromAgent: AgentId | null;
  kind: string;
  title: string;
  status: ItemStatus;
  // Free-form per kind. Known keys the page draws: steps
  // ({ label, state: "done" | "now" | "todo" }[]), stats ({ label, value }[]),
  // quote (string), plan (string[]), previewUrl (string), thumbs (string[]).
  payload: Record<string, unknown>;
  // SHA-256 of the payload as listed. The page sends it back with Approve,
  // and a card rewritten since is refused (agentItems.decideItem).
  payloadHash?: string;
  approvedAt: string | null;
  updatedAt: string;
}

export interface AgentLesson {
  // Obsidian block id, e.g. "l-3fa9c021".
  id: string;
  scope: LessonScope;
  tenantId: string | null;
  agent: AgentId;
  text: string;
  source: string;
  learnedOn: string | null;
}

export interface LessonEdit {
  id: string;
  lessonId: string;
  action: "edit" | "delete";
  text: string | null;
}

export interface RunnerStatus {
  online: boolean;
  lastSeenAt: string | null;
}

// Runner API.

export interface ClaimTenant {
  id: string;
  name: string;
  slug: string;
  metaAdAccountId: string | null;
}

export interface ClaimChat {
  id: string;
  tenantId: string | null;
  agent: AgentId;
  title: string;
  claudeSessionId: string;
  started: boolean;
}

export interface ClaimResponse {
  message: AgentMessage;
  chat: ClaimChat;
  // Earlier messages in the chat, oldest first, for a fresh session's context.
  history: AgentMessage[];
  tenant: ClaimTenant | null;
  // The client's whole brief with versions, every section in BRIEF_SECTIONS
  // order. [] for the agency Manager, which has no client.
  brief: BriefSection[];
}

// The runner's reply to an approved request, for the agent that asked
// (POST /api/agent-runner/answer). messageId is the claimed follow-up.
export interface AnswerBody {
  messageId: string;
  body: string;
}

export interface ReplyBody {
  messageId: string;
  status: "running" | "done" | "error";
  aiBody?: string;
  tools?: string[];
  used?: string[];
  learned?: string[];
  title?: string;
  error?: string;
}

export interface ItemBody {
  id?: string;
  tenantId: string | null;
  agent: AgentId;
  chatId?: string | null;
  fromAgent?: AgentId | null;
  kind: string;
  title: string;
  status: ItemStatus;
  payload: Record<string, unknown>;
  // Who made the card. "runner": the runner itself (a staged final, a
  // deployed preview, a spend alert); stored as payload.runnerOwned, and an
  // agent's rewrite of such a card is refused. Anything parsed from model
  // output is "agent", and so is a body with no origin.
  origin?: ItemOrigin;
}

export type ItemOrigin = "runner" | "agent";

export interface LessonsBody {
  scopes: { scope: LessonScope; tenantId: string | null; agent: AgentId }[];
  lessons: AgentLesson[];
  appliedEditIds: string[];
}

export interface HeartbeatBody {
  host: string;
  monitored?: boolean;
}

export interface HeartbeatResponse {
  lastMonitorAt: string | null;
  queuedEdits: LessonEdit[];
}

export interface Snapshot {
  cpl: number | null;
  frequency: number | null;
  leads7d: number;
  stuckNewOver48h: number;
  checklistDone: number;
  checklistTotal: number;
  accountsRed: number;
}

// Runner-only: queue a startup-check chat. Not in the Task 3 list in the plan
// doc but needed by Task 9; served at POST /api/agent-runner/auto-chat.
export interface AutoChatBody {
  tenantId: string | null;
  agent: AgentId;
  title: string;
  prompt: string;
}

// Runner-only: a landing page Jake approved is live; file it into Conversion
// Assets and mark its card live. POST /api/agent-runner/file-asset. The card is
// the one named by the message's deploy grant, read on the server, never sent.
export interface FileAssetBody {
  messageId: string;
  tenantId: string;
  title: string;
  liveUrl: string;
}

// Runner-only: the client list to monitor. GET /api/agent-runner/tenants.
export type TenantsResponse = ClaimTenant[];

// Runner-only, Creative Agent (Phase 3): finished creatives go into the
// ad-creatives bucket through signed URLs, so the bytes never pass through the
// Worker. Every call names the claimed message; the app checks it is running
// in a Creative chat for that client (and, to file, carries a file grant).
// POST /api/agent-runner/upload-url, /read-url, /file-creative.
export interface UploadUrlBody {
  messageId: string;
  tenantId: string;
  type: string;
  size: number;
  // A preview goes under <tenant>/previews/ and is pruned after a week; only a
  // final at <tenant>/<uuid>.<ext> can be filed into Creatives.
  preview: boolean;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  path: string;
}

export interface ReadUrlBody {
  messageId: string;
  tenantId: string;
  path: string;
}

export interface ReadUrlResponse {
  url: string;
}

export interface FileCreativeBody {
  messageId: string;
  tenantId: string;
  path: string;
  name: string;
  type: string;
  size: number;
}

// The Client Brief (Phase 6, migration 0168): one section per agent, the
// Manager's being "Status". version 0 means nothing has been written yet; a
// save names the version it read and a stale one gets 409 with the current
// section. updatedBy is "jake" or the agent that wrote it.
//
// Brief v2 (2026-10-17, migration 0169) adds three sections no agent writes:
// Client (the onboarding answers, Jake's) and the Onboarding Call and Launch
// Call checklists.
export type BriefAuthor = "jake" | AgentId;
export type BriefSectionId = AgentId | "client" | "onboarding-call" | "launch-call";

// One checkbox under a section, as the runner gets it in the claim: the label
// an agent names in a ```tick block, and whether it is ticked.
export interface BriefBox {
  label: string;
  done: boolean;
}

export interface BriefSection {
  section: BriefSectionId;
  body: string;
  version: number;
  updatedBy: BriefAuthor | null;
  updatedAt: string | null;
  // Only on a claim: the section's manual boxes (BRIEF_BOXES). Never sent to
  // the app, which reads the checklist itself.
  boxes?: BriefBox[];
}

// Where the brief's Google Doc is and how the last sync went. null until the
// first sync has run.
export interface BriefDrive {
  docUrl: string | null;
  syncedAt: string | null;
  error: string | null;
  // The Doc was written from this brief (sum of section versions); behind the
  // brief means a sync is still on its way.
  revision: number;
}

export interface BriefResponse {
  sections: BriefSection[];
  drive: BriefDrive | null;
}

// PUT /api/admin/agents/brief?tenant=
export interface BriefSaveBody {
  section: BriefSectionId;
  body: string;
  version: number;
}

// Runner-only: an agent rewrites its own section. POST /api/agent-runner/brief.
// The section is the claimed message's chat's agent, read on the server.
export interface RunnerBriefBody {
  messageId: string;
  body: string;
  version: number;
}

// Runner-only: an agent ticks boxes in a section it may tick, by label.
// POST /api/agent-runner/tick. Which sections that is comes from the chat's
// agent on the server (tickSections); a label anywhere else is refused.
export interface RunnerTickBody {
  messageId: string;
  labels: string[];
}

export interface RunnerTickResult {
  ticked: string[];
  refused: string[];
}
