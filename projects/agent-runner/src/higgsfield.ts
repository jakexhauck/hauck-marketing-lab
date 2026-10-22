// The runner's own way into Higgsfield, for the Ads Agent on Hermes
// (docs/build-plans/hermes-ads.md).
//
// On the PC, claude reached Higgsfield with Jake's own login and the credit
// gate was claude's tool lists (spend.ts). A Hermes profile cannot be given
// different tools per turn, so Higgsfield is not in its config at all: the
// runner's MCP bridge serves the Higgsfield tools itself and forwards each
// allowed call here. Quote tools always; generate tools only on a turn that
// carries Jake's spend grant (mcpBridge.ts decides, before anything is sent).
//
// The login is the runner's, made once with higgsfieldLogin.ts and kept in a
// file only the runner container mounts (/config/higgsfield.json on the VPS),
// so no agent can read the token. Access tokens expire; the refresh token
// renews them, and a renewed refresh token is saved over the old one.
//
// MCP over streamable HTTP: initialize once per session, then tools/list and
// tools/call. An answer comes back as JSON or as a short SSE stream; both are
// read. A lost session (404) starts a new one.

import { existsSync, readFileSync, writeFileSync } from "node:fs";

export const HF_MCP_URL = "https://mcp.higgsfield.ai/mcp";
export const HF_TOKEN_URL = "https://clerk.higgsfield.ai/oauth/token";

export interface HfLogin {
  clientId: string;
  accessToken: string;
  refreshToken: string;
  // ms since epoch
  expiresAt: number;
}

export interface HfStore {
  read(): HfLogin | null;
  write(l: HfLogin): void;
}

export function fileStore(path: string): HfStore {
  return {
    read() {
      if (!existsSync(path)) return null;
      try {
        const v = JSON.parse(readFileSync(path, "utf8"));
        return typeof v?.clientId === "string" && typeof v?.refreshToken === "string" ? (v as HfLogin) : null;
      } catch {
        return null;
      }
    },
    write(l) {
      writeFileSync(path, JSON.stringify(l, null, 2) + "\n", { mode: 0o600 });
    },
  };
}

export interface HfTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface HfResult {
  text: string;
  isError: boolean;
}

export interface Higgsfield {
  // Whether a login is saved at all; without one the Ads Agent gets no Higgsfield tools.
  ready(): boolean;
  listTools(): Promise<HfTool[]>;
  call(name: string, args: Record<string, unknown>): Promise<HfResult>;
}

/** A token answer from the token endpoint, as a saved login. */
export function loginFrom(clientId: string, t: Record<string, unknown>, now: number, keepRefresh = ""): HfLogin {
  const access = typeof t.access_token === "string" ? t.access_token : "";
  if (!access) throw new Error(`no access token in the answer: ${JSON.stringify(t).slice(0, 200)}`);
  const refresh = typeof t.refresh_token === "string" && t.refresh_token ? t.refresh_token : keepRefresh;
  if (!refresh) throw new Error("no refresh token in the answer (offline_access missing?)");
  const secs = typeof t.expires_in === "number" ? t.expires_in : 3600;
  return { clientId, accessToken: access, refreshToken: refresh, expiresAt: now + secs * 1000 };
}

/** The JSON-RPC answer with this id, from a JSON body or an SSE stream. */
export function readRpc(body: string, contentType: string, id: number): Record<string, unknown> | null {
  const pick = (v: unknown) => (v && typeof v === "object" && (v as { id?: unknown }).id === id ? (v as Record<string, unknown>) : null);
  if (!/event-stream/i.test(contentType)) {
    try {
      const v = JSON.parse(body);
      return Array.isArray(v) ? (v.map(pick).find(Boolean) ?? null) : pick(v);
    } catch {
      return null;
    }
  }
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    try {
      const hit = pick(JSON.parse(line.slice(5).trim()));
      if (hit) return hit;
    } catch {
      // a partial or non-JSON line; keep looking
    }
  }
  return null;
}

function resultText(r: Record<string, unknown>): HfResult {
  const content = Array.isArray(r.content) ? (r.content as { type?: string; text?: string }[]) : [];
  const text = content.map((c) => (c.type === "text" ? c.text ?? "" : `[${c.type}]`)).join("\n");
  return { text: text || JSON.stringify(r.structuredContent ?? r).slice(0, 20_000), isError: r.isError === true };
}

export function higgsfieldClient(o: { store: HfStore; fetch?: typeof fetch; now?: () => number; mcpUrl?: string; tokenUrl?: string }): Higgsfield {
  const f = o.fetch ?? fetch;
  const now = o.now ?? Date.now;
  const mcpUrl = o.mcpUrl ?? HF_MCP_URL;
  const tokenUrl = o.tokenUrl ?? HF_TOKEN_URL;
  let session: string | null = null;
  let seq = 0;
  let tools: HfTool[] | null = null;
  // One refresh and one session start at a time. Two refreshes with the same
  // refresh token would race, and a rotated token makes the loser fail (or
  // gets the whole login revoked).
  let refreshing: Promise<HfLogin> | null = null;
  let opening: Promise<void> | null = null;

  async function refresh(l: HfLogin): Promise<HfLogin> {
    const res = await f(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: l.refreshToken, client_id: l.clientId }),
      signal: AbortSignal.timeout(30_000),
    });
    const t = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(`Higgsfield login expired (${res.status} ${String(t.error ?? "")}); sign in again with higgsfieldLogin.ts`);
    const next = loginFrom(l.clientId, t, now(), l.refreshToken);
    o.store.write(next);
    return next;
  }

  // failed: the access token Higgsfield just refused. Renewed only if it is
  // still the saved one; a call that raced another's renewal just uses the new.
  async function token(failed?: string): Promise<string> {
    let l = o.store.read();
    if (!l) throw new Error("Higgsfield is not signed in on this runner");
    const stale = failed ? l.accessToken === failed : l.expiresAt - now() < 60_000;
    if (stale) {
      const from = l;
      refreshing ??= refresh(from).finally(() => (refreshing = null));
      l = await refreshing;
    }
    return l.accessToken;
  }

  async function post(method: string, params: unknown, notify = false): Promise<{ status: number; rpc: Record<string, unknown> | null }> {
    const id = ++seq;
    const send = async (bearer: string) =>
      f(mcpUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${bearer}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...(session ? { "mcp-session-id": session } : {}),
        },
        body: JSON.stringify(notify ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id, method, params }),
        signal: AbortSignal.timeout(10 * 60_000),
      });
    const bearer = await token();
    let res = await send(bearer);
    if (res.status === 401) {
      await res.text().catch(() => "");
      res = await send(await token(bearer));
    }
    const sid = res.headers.get("mcp-session-id");
    if (sid) session = sid;
    const body = await res.text();
    if (notify) return { status: res.status, rpc: null };
    return { status: res.status, rpc: readRpc(body, res.headers.get("content-type") ?? "", id) };
  }

  async function open(): Promise<void> {
    session = null;
    const r = await post("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "hauck-agent-runner", version: "1.0.0" },
    });
    if (r.status >= 400 || !r.rpc?.result) throw new Error(`Higgsfield initialize failed (${r.status})`);
    await post("notifications/initialized", {}, true);
  }

  const reopen = () => (opening ??= open().finally(() => (opening = null)));

  async function rpc(method: string, params: unknown): Promise<Record<string, unknown>> {
    if (!session) await reopen();
    const used = session;
    let r = await post(method, params);
    // The server forgot the session (a restart, an idle timeout): once more,
    // fresh. Only if no other call has opened a new one meanwhile.
    if (r.status === 404) {
      if (session === used) session = null;
      await reopen();
      r = await post(method, params);
    }
    const err = r.rpc?.error as { message?: string } | undefined;
    if (r.status >= 400 || !r.rpc) throw new Error(`Higgsfield ${method} failed (${r.status})${err?.message ? `: ${err.message}` : ""}`);
    if (err) throw new Error(`Higgsfield ${method}: ${err.message ?? "error"}`);
    return (r.rpc.result ?? {}) as Record<string, unknown>;
  }

  return {
    ready: () => o.store.read() !== null,
    async listTools() {
      if (tools) return tools;
      const r = await rpc("tools/list", {});
      tools = Array.isArray(r.tools) ? (r.tools as HfTool[]) : [];
      return tools;
    },
    async call(name, args) {
      return resultText(await rpc("tools/call", { name, arguments: args }));
    },
  };
}
