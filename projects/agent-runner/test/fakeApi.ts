// An in-memory stand-in for the app's /api/agent-runner/* endpoints. The real
// ones are built in another lane and not deployed yet, so every runner test
// talks to this instead, and it records what it was sent.

import type { RunnerApi } from "../src/api.ts";
import type {
  AutoChatBody,
  ClaimResponse,
  HeartbeatResponse,
  ItemBody,
  LessonsBody,
  ReplyBody,
  Snapshot,
  ClaimTenant,
} from "../src/wire.ts";

export interface FakeApi extends RunnerApi {
  replies: ReplyBody[];
  items: ItemBody[];
  lessonPosts: LessonsBody[];
  heartbeats: { host: string; monitored?: boolean }[];
  autoChats: AutoChatBody[];
  claims: (ClaimResponse | null)[];
  snapshots: Record<string, Snapshot>;
  tenantList: ClaimTenant[];
  heartbeatReply: HeartbeatResponse;
}

export function fakeApi(init: Partial<Pick<FakeApi, "claims" | "snapshots" | "tenantList" | "heartbeatReply">> = {}): FakeApi {
  const api: FakeApi = {
    replies: [],
    items: [],
    lessonPosts: [],
    heartbeats: [],
    autoChats: [],
    claims: init.claims ?? [],
    snapshots: init.snapshots ?? {},
    tenantList: init.tenantList ?? [],
    heartbeatReply: init.heartbeatReply ?? { lastMonitorAt: null, queuedEdits: [] },
    async claim() {
      return api.claims.shift() ?? null;
    },
    async reply(b) {
      api.replies.push(b);
    },
    async item(b) {
      api.items.push(b);
      return { id: `item-${api.items.length}` };
    },
    async lessons(b) {
      api.lessonPosts.push(b);
    },
    async heartbeat(b) {
      api.heartbeats.push(b);
      return api.heartbeatReply;
    },
    async snapshot(tenantId) {
      const s = api.snapshots[tenantId];
      if (!s) throw new Error(`no snapshot for ${tenantId}`);
      return s;
    },
    async tenants() {
      return api.tenantList;
    },
    async autoChat(b) {
      api.autoChats.push(b);
      return { chatId: `chat-${api.autoChats.length}` };
    },
  };
  return api;
}
