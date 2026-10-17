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
  RunnerBriefBody,
  RunnerBriefResult,
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
  briefs: RunnerBriefBody[];
  // What the next brief post answers; saved at the version sent + 1 if unset.
  briefAnswer: ((b: RunnerBriefBody) => RunnerBriefResult) | null;
}

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
    briefs: [],
    briefAnswer: null,
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
    async fileAsset(b) {
      api.fileAssets.push(b);
      return { assetId: `asset-${api.fileAssets.length}` };
    },
    async brief(b) {
      api.briefs.push(b);
      if (api.briefAnswer) return api.briefAnswer(b);
      return { saved: true, section: { section: "ads", body: b.body, version: b.version + 1, updatedBy: "ads", updatedAt: null } };
    },
  };
  return api;
}
