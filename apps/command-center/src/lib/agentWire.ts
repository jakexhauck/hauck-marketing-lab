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
// (GHL), filing into an app page. Copied by PATCH items/:id approve from the
// card's payload.grant onto the follow-up message; the runner and the server
// both check it before a gated action.
export type GrantKind = "deploy" | "spend" | "ghl" | "file";
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
}

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
