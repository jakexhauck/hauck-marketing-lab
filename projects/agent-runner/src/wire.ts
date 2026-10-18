// Mirrors the runner half of apps/command-center/src/lib/agentWire.ts (and the
// agent ids in apps/command-center/src/lib/agents.ts). The runner is its own
// package with no build step shared with the app, so it keeps a copy rather
// than reaching across the repo. Change both together: a field renamed on one
// side and not the other fails quietly, as an undefined on the wire.
//
// Field names are camelCase on the wire; the tables (0166) are snake_case.

export type AgentId = "manager" | "research" | "ads" | "creative" | "landing" | "ghl" | "reporting";

export type MessageRole = "me" | "ai" | "request";
export type MessageStatus = "queued" | "running" | "done" | "error";
export type ItemStatus = "building" | "needs_ok" | "live" | "done" | "declined";
export type LessonScope = "client" | "agent" | "manager";

// What an Approve unlocks for the agent's next turn only. See agentWire.ts.
export type GrantKind = "deploy" | "spend" | "ghl" | "file" | "meta";
export interface Grant {
  itemId: string;
  kind: GrantKind;
  limit: number | null;
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
  // me: the card a click answered, and the grant when the click was Approve.
  followUpOf: string | null;
  grant: Grant | null;
  // request: set on an answer, the request card it answers. An answer is
  // queued in the asking agent's chat and run like Jake's message, but it is
  // never role "me", so no "Jake asked" gate opens for it.
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
  // See agentWire.ts: the hash an Approve must match.
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
  // The client's whole Client Brief with versions ([] at the agency). Optional
  // here so a claim from an app that predates the brief still runs.
  brief?: BriefSection[];
  // The agent's own SOP from the Director: stages in order, drafts left out.
  // Optional so a claim from an app that predates the Director still runs.
  sop?: SopStage[];
}

export interface SopStage {
  name: string;
  tasks: { name: string; owner: "agent" | "jake" | "client"; steps: string[] }[];
}

// The agent's reply to an approved request, for the agent that asked. The app
// finds the request through the claimed message and posts it once.
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
  // See agentWire.ts. "runner" only on cards the runner makes itself;
  // anything parsed from model output is "agent".
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

// The Client Brief (Phase 6). One section per agent; version 0 is unwritten.
// Brief v2 adds Client and the two call checklists, which no agent writes.
export type BriefAuthor = "jake" | AgentId;
export type BriefSectionId = AgentId | "client" | "onboarding-call" | "launch-call";

// A checkbox under a section: the label a ```tick block names.
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
  // The section's manual boxes, from an app that has Brief v2.
  boxes?: BriefBox[];
}

// Runner-only: an agent ticks boxes by label. POST /api/agent-runner/tick. The
// app decides which sections the chat's agent may tick and refuses the rest.
export interface RunnerTickBody {
  messageId: string;
  labels: string[];
}

export interface RunnerTickResult {
  ticked: string[];
  refused: string[];
}

// Runner-only: an agent rewrites its own section at the version it read.
// POST /api/agent-runner/brief. The section is the chat's agent, on the server.
export interface RunnerBriefBody {
  messageId: string;
  body: string;
  version: number;
}

// 200 saved, or 409 stale with the section as it now stands.
export type RunnerBriefResult = { saved: true; section: BriefSection } | { saved: false; section: BriefSection };
