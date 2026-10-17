// An in-memory stand-in for the app's /api/agent-runner/* endpoints. The real
// ones are built in another lane and not deployed yet, so every runner test
// talks to this instead, and it records what it was sent.

import type { RunnerApi } from "../src/api.ts";
import type {
  AutoChatBody,
  ClaimResponse,
  FileAssetBody,
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
  fileAssets: FileAssetBody[];
  claims: (ClaimResponse | null)[];
  snapshots: Record<string, Snapshot>;
  tenantList: ClaimTenant[];
  heartbeatReply: HeartbeatResponse;
  // Cards Jake has decided (or that belong to another chat or agent): the
  // real endpoint refuses a rewrite of one, so this does too.
  refused: Set<string>;
}

// The n-th card id the fake hands out: a real uuid shape, as the app's are.
export const fakeId = (n: number) => `${n.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;

export function fakeApi(init: Partial<Pick<FakeApi, "claims" | "snapshots" | "tenantList" | "heartbeatReply">> = {}): FakeApi {
  const api: FakeApi = {
    replies: [],
    items: [],
    lessonPosts: [],
    heartbeats: [],
    autoChats: [],
    fileAssets: [],
    claims: init.claims ?? [],
    snapshots: init.snapshots ?? {},
    tenantList: init.tenantList ?? [],
    heartbeatReply: init.heartbeatReply ?? { lastMonitorAt: null, queuedEdits: [] },
    refused: new Set(),
    async claim() {
      return api.claims.shift() ?? null;
    },
    async reply(b) {
      api.replies.push(b);
    },
    async item(b) {
      if (b.id && api.refused.has(b.id)) throw new Error("POST item 400: {\"error\":\"item not found\"}");
      api.items.push(b);
      return { id: b.id ?? fakeId(api.items.length) };
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
    async fileAsset(b) {
      api.fileAssets.push(b);
      return { assetId: `asset-${api.fileAssets.length}` };
    },
  };
  return api;
}
