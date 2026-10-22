import { describe, expect, it } from "vitest";
import { higgsfieldClient, loginFrom, readRpc, type HfLogin, type HfStore } from "../src/higgsfield.ts";

function memStore(l: HfLogin | null): HfStore & { saved: HfLogin[] } {
  let cur = l;
  const saved: HfLogin[] = [];
  return {
    saved,
    read: () => cur,
    write(n) {
      cur = n;
      saved.push(n);
    },
  };
}

const NOW = 1_000_000;
const login = (over: Partial<HfLogin> = {}): HfLogin => ({ clientId: "c1", accessToken: "a1", refreshToken: "r1", expiresAt: NOW + 3_600_000, ...over });

interface Seen {
  url: string;
  auth: string | null;
  session: string | null;
  body: string;
}

// A Higgsfield stand-in: the token endpoint, and an MCP endpoint that wants a
// session after initialize and answers tools/call as SSE.
function fakeServer(o: { expired?: Set<string>; dropSessionOnce?: boolean } = {}) {
  const seen: Seen[] = [];
  let sessions = 0;
  let dropped = false;
  const f = (async (url: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    const body = String(init.body ?? "");
    seen.push({ url, auth: headers.get("authorization"), session: headers.get("mcp-session-id"), body });
    if (url.endsWith("/oauth/token")) {
      return Response.json({ access_token: "a2", refresh_token: "r2", expires_in: 3600 });
    }
    const token = (headers.get("authorization") ?? "").slice(7);
    if (o.expired?.has(token)) return new Response("{}", { status: 401 });
    const msg = JSON.parse(body);
    if (msg.method === "initialize") {
      sessions++;
      return Response.json({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2025-06-18" } }, { headers: { "mcp-session-id": `s${sessions}` } });
    }
    if (msg.id === undefined) return new Response(null, { status: 202 });
    if (o.dropSessionOnce && !dropped) {
      dropped = true;
      return new Response("{}", { status: 404 });
    }
    if (msg.method === "tools/list") return Response.json({ jsonrpc: "2.0", id: msg.id, result: { tools: [{ name: "balance", inputSchema: {} }] } });
    const sse = `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: `ran ${msg.params.name}` }] } })}\n\n`;
    return new Response(sse, { headers: { "content-type": "text/event-stream" } });
  }) as unknown as typeof fetch;
  return { f, seen };
}

describe("readRpc", () => {
  it("finds the answer with its id in JSON or in an SSE stream", () => {
    expect(readRpc('{"jsonrpc":"2.0","id":3,"result":{}}', "application/json", 3)).toEqual({ jsonrpc: "2.0", id: 3, result: {} });
    expect(readRpc('{"jsonrpc":"2.0","id":2,"result":{}}', "application/json", 3)).toBeNull();
    const sse = 'event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\n\ndata: {"jsonrpc":"2.0","id":3,"result":{"ok":1}}\n\n';
    expect(readRpc(sse, "text/event-stream; charset=utf-8", 3)).toEqual({ jsonrpc: "2.0", id: 3, result: { ok: 1 } });
  });
});

describe("loginFrom", () => {
  it("keeps the old refresh token when the answer has no new one", () => {
    expect(loginFrom("c1", { access_token: "a", expires_in: 60 }, NOW, "r-old")).toEqual({ clientId: "c1", accessToken: "a", refreshToken: "r-old", expiresAt: NOW + 60_000 });
    expect(() => loginFrom("c1", { access_token: "a" }, NOW)).toThrow(/refresh token/);
  });
});

describe("higgsfieldClient", () => {
  it("opens a session, then calls tools in it", async () => {
    const s = fakeServer();
    const hf = higgsfieldClient({ store: memStore(login()), fetch: s.f, now: () => NOW });
    expect(await hf.call("balance", {})).toEqual({ text: "ran balance", isError: false });
    expect(await hf.listTools()).toEqual([{ name: "balance", inputSchema: {} }]);
    const methods = s.seen.map((x) => JSON.parse(x.body).method);
    expect(methods).toEqual(["initialize", "notifications/initialized", "tools/call", "tools/list"]);
    expect(s.seen.slice(1).every((x) => x.session === "s1" && x.auth === "Bearer a1")).toBe(true);
  });

  it("renews an expiring token first and saves the new login", async () => {
    const s = fakeServer();
    const store = memStore(login({ expiresAt: NOW + 10_000 }));
    const hf = higgsfieldClient({ store, fetch: s.f, now: () => NOW });
    await hf.call("balance", {});
    expect(s.seen[0].url).toMatch(/oauth\/token$/);
    expect(s.seen[0].body).toContain("grant_type=refresh_token");
    expect(store.saved[0]).toMatchObject({ accessToken: "a2", refreshToken: "r2" });
    expect(s.seen[1].auth).toBe("Bearer a2");
  });

  it("renews and retries once when Higgsfield says the token is no good", async () => {
    const s = fakeServer({ expired: new Set(["a1"]) });
    const hf = higgsfieldClient({ store: memStore(login()), fetch: s.f, now: () => NOW });
    expect((await hf.call("balance", {})).text).toBe("ran balance");
    expect(s.seen.map((x) => x.auth ?? x.url)).toContain("https://clerk.higgsfield.ai/oauth/token");
  });

  it("renews once for calls that start together near expiry", async () => {
    const s = fakeServer();
    const store = memStore(login({ expiresAt: NOW + 10_000 }));
    const hf = higgsfieldClient({ store, fetch: s.f, now: () => NOW });
    await Promise.all([hf.call("balance", {}), hf.call("models_explore", {})]);
    expect(s.seen.filter((x) => x.url.endsWith("/oauth/token"))).toHaveLength(1);
    expect(s.seen.filter((x) => x.body.includes('"initialize"'))).toHaveLength(1);
  });

  it("starts a new session when the old one is gone", async () => {
    const s = fakeServer({ dropSessionOnce: true });
    const hf = higgsfieldClient({ store: memStore(login()), fetch: s.f, now: () => NOW });
    expect((await hf.call("balance", {})).text).toBe("ran balance");
    expect(s.seen.filter((x) => JSON.parse(x.body).method === "initialize")).toHaveLength(2);
  });

  it("says so when it was never signed in", async () => {
    const hf = higgsfieldClient({ store: memStore(null), fetch: fakeServer().f });
    expect(hf.ready()).toBe(false);
    await expect(hf.call("balance", {})).rejects.toThrow(/not signed in/);
  });
});
