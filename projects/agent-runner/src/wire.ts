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
export type GrantKind = "deploy" | "spend" | "ghl" | "file";
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
