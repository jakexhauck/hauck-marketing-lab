// The app's side of the wire: /api/agent-runner/* on app.hauckmarketing.com,
// behind the x-agent-runner-secret header.
//
// The PC holds no Supabase key, no Meta token and no GHL token. Everything the
// runner reads or writes goes through these endpoints, so the app decides what
// a runner may do (Meta read-only is enforced there) and a stolen runner
// secret is one rotation in Doppler, not a credential hunt.
//
// An interface, so every test talks to an in-memory fake (test/fakeApi.ts)
// instead of the network.

import type {
  AutoChatBody,
  ClaimResponse,
  HeartbeatBody,
  HeartbeatResponse,
  ItemBody,
  LessonsBody,
  ReplyBody,
  Snapshot,
  TenantsResponse,
} from "./wire.ts";

export interface RunnerApi {
  claim(host: string): Promise<ClaimResponse | null>;
  reply(body: ReplyBody): Promise<void>;
  item(body: ItemBody): Promise<unknown>;
  lessons(body: LessonsBody): Promise<void>;
  heartbeat(body: HeartbeatBody): Promise<HeartbeatResponse>;
  snapshot(tenantId: string): Promise<Snapshot>;
  tenants(): Promise<TenantsResponse>;
  autoChat(body: AutoChatBody): Promise<{ chatId: string }>;
}

export interface ApiOptions {
  base: string;
  secret: string;
  fetch?: typeof fetch;
}

export function createApi(opts: ApiOptions): RunnerApi {
  const base = opts.base.replace(/\/+$/, "");
  const f = opts.fetch ?? fetch;

  async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { "x-agent-runner-secret": opts.secret };
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await f(`${base}/api/agent-runner/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${text.slice(0, 300)}`);
    // An empty body (204, or a bare 200) means "nothing", which for claim is
    // the normal answer: no message is waiting.
    return (text.trim() ? JSON.parse(text) : null) as T;
  }

  return {
    claim: (host) => call<ClaimResponse | null>("POST", "claim", { host }),
    reply: async (b) => void (await call("POST", "reply", b)),
    item: (b) => call("POST", "item", b),
    lessons: async (b) => void (await call("POST", "lessons", b)),
    heartbeat: (b) => call<HeartbeatResponse>("POST", "heartbeat", b),
    snapshot: (id) => call<Snapshot>("GET", `snapshot?tenant=${encodeURIComponent(id)}`),
    tenants: async () => (await call<TenantsResponse | null>("GET", "tenants")) ?? [],
    autoChat: (b) => call<{ chatId: string }>("POST", "auto-chat", b),
  };
}
