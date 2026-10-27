import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";
import type { GrokDeps } from "./grokMcp";
import { verifySession } from "./session";
import { appPath, appUrl, forLog, readAnswer, SOFTWARE_API_TOOLS } from "./grokSoftwareApi";

const ENV = { SESSION_SECRET: "s".repeat(40) } as Env;
const ORIGIN = "https://app.hauckmarketing.com";
const AAG = { id: "1b2c3d4e-0000-4000-8000-000000000001", name: "AAG Windows", slug: "aag-windows" };

// A Supabase stand-in: the client list, the owner lookup, and audit inserts.
function fakeDb() {
  const inserts: Record<string, unknown>[] = [];
  const client = {
    from: (table: string) => {
      if (table === "admin_audit_log") return { insert: (row: Record<string, unknown>) => (inserts.push(row), Promise.resolve({ error: null })) };
      if (table === "tenants") {
        const c: any = { select: () => c, order: () => Promise.resolve({ data: [AAG], error: null }) };
        return c;
      }
      const chain: any = { select: () => chain, eq: () => chain, order: () => chain, limit: () => Promise.resolve({ data: [{ id: "owner-1" }], error: null }) };
      return chain;
    },
  } as unknown as SupabaseClient;
  return { client, inserts };
}

type Sent = { url: string; init: RequestInit; logsBefore: number };

function stubFetch(inserts: unknown[], answer: () => Response) {
  const sent: Sent[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      sent.push({ url: String(url), init, logsBefore: inserts.length });
      return answer();
    }),
  );
  return sent;
}

const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
const tool = (name: string) => SOFTWARE_API_TOOLS.find((t) => t.name === name)!;
const sessionOf = (s: Sent) => verifySession(new Request(s.url, { headers: s.init.headers }), ENV);

afterEach(() => vi.unstubAllGlobals());

describe("appPath", () => {
  it("takes any path under /api and fills :tenantId from the client", () => {
    expect(appPath("/api/admin/clients/:tenantId/mission-control", AAG)).toBe(`/api/admin/clients/${AAG.id}/mission-control`);
    expect(appPath("/api/admin/clients/{tenantId}/ads/drive-creatives", AAG)).toBe(`/api/admin/clients/${AAG.id}/ads/drive-creatives`);
    expect(appPath("/api/admin/onboarding", null)).toBe("/api/admin/onboarding");
    expect(appPath("/api/leads", AAG)).toBe("/api/leads");
  });

  it("says what is wrong rather than guessing", () => {
    expect(() => appPath("/api/admin/clients/:tenantId/accounts", null)).toThrow(/client/);
    expect(() => appPath("/api/admin/tasks/:taskId", null)).toThrow(/:taskId/);
    expect(() => appPath("/admin/clients", null)).toThrow(/\/api\//);
    expect(() => appPath("https://evil.example/api/x", null)).toThrow(/\/api\//);
    expect(() => appPath("/api/admin/../auth/me", null)).toThrow(/path/);
    expect(() => appPath("/api/admin/clients?x=1", null)).toThrow(/query/);
    expect(() => appPath(5, null)).toThrow(/path/);
  });

  it("never reaches the connectors through themselves, whatever the case", () => {
    expect(() => appPath("/api/grok/software/key", null)).toThrow(/connector/);
    expect(() => appPath("/api/GROK/software/key", null)).toThrow(/connector/);
  });
});

describe("appUrl", () => {
  it("stays on the app's own origin and carries the query", () => {
    const url = appUrl(ORIGIN, "/api/admin/clients", { q: "aag", ids: ["a", "b"] });
    expect(url.origin).toBe(ORIGIN);
    expect(url.pathname).toBe("/api/admin/clients");
    expect(url.searchParams.getAll("ids")).toEqual(["a", "b"]);
  });
});

describe("forLog", () => {
  it("keeps passwords, tokens and secrets out of the change log, at any depth", () => {
    expect(forLog({ name: "Bob", password: "hunter2", nested: [{ apiKey: "k", token: "t", note: "hi" }] })).toEqual({
      name: "Bob",
      password: "(hidden)",
      nested: [{ apiKey: "(hidden)", token: "(hidden)", note: "hi" }],
    });
    expect(forLog(undefined)).toBeNull();
  });

  it("reads a body sent as a JSON string the same way, and never logs other text", () => {
    expect(forLog('{"password":"x","name":"Bob"}')).toEqual({ password: "(hidden)", name: "Bob" });
    expect(forLog("password=x")).toBe("(text body)");
  });
});

describe("readAnswer", () => {
  it("hands back JSON, text, redirects and files in a form the bot can read", async () => {
    expect(await readAnswer("GET", "/x", json({ a: 1 }))).toBe('{\n "a": 1\n}');
    expect(await readAnswer("GET", "/x", new Response("hello", { headers: { "content-type": "text/plain" } }))).toBe("hello");
    expect(await readAnswer("POST", "/x", new Response(null, { status: 204 }))).toBe("204, no body");
    expect(await readAnswer("GET", "/x", new Response(null, { status: 302, headers: { location: "https://drive.google.com/x" } }))).toBe(
      "302, redirects to https://drive.google.com/x",
    );
    expect(await readAnswer("GET", "/x", new Response(new Uint8Array(10), { headers: { "content-type": "image/png" } }))).toMatch(/image\/png/);
    // A file's size comes from its header; the bytes are never read.
    const big = new Response(new ReadableStream({ pull: () => Promise.reject(new Error("read the body")) }), {
      headers: { "content-type": "video/mp4", "content-length": "90000000" },
    });
    expect(await readAnswer("GET", "/x", big)).toMatch(/video\/mp4, 90000000 bytes/);
  });

  it("an error answer is an error, with the app's own message", async () => {
    await expect(readAnswer("POST", "/api/x", json({ error: "Pick a doc." }, 400))).rejects.toThrow(/POST \/api\/x returned 400: .*Pick a doc\./);
  });
});

describe("software_request", () => {
  it("calls an admin route as the owner admin, with a one-minute session", async () => {
    const { client, inserts } = fakeDb();
    const sent = stubFetch(inserts, () => json({ hasFolder: true, doc: null }));
    const deps: GrokDeps = { client, env: ENV, origin: ORIGIN };
    const out = await tool("software_request").run(deps, { client: "aag", path: "/api/admin/clients/:tenantId/mission-control" });
    expect(JSON.parse(out)).toEqual({ hasFolder: true, doc: null });
    expect(sent[0].url).toBe(`${ORIGIN}/api/admin/clients/${AAG.id}/mission-control`);
    expect(sent[0].init.method).toBe("GET");
    expect(sent[0].init.redirect).toBe("manual");
    expect(await sessionOf(sent[0])).toEqual({ mode: "live", adminId: "owner-1" });
    // A read is not a change: no log row.
    expect(inserts).toHaveLength(0);
  });

  it("logs a change, naming the bot, before it is sent", async () => {
    const { client, inserts } = fakeDb();
    const sent = stubFetch(inserts, () => json({ hasFolder: true, doc: { id: "doc1" } }));
    await tool("software_request").run(
      { client, env: ENV, origin: ORIGIN },
      { client: "AAG Windows", method: "post", path: "/api/admin/clients/:tenantId/mission-control", body: { docId: "doc1" }, bot: "Ops Bot" },
    );
    expect(sent[0].logsBefore).toBe(1);
    expect(sent[0].init.body).toBe('{"docId":"doc1"}');
    expect(inserts[0]).toMatchObject({
      action: "grok:software_request",
      target_tenant_id: AAG.id,
      payload: { bot: "Ops Bot", method: "POST", path: `/api/admin/clients/${AAG.id}/mission-control`, body: { docId: "doc1" } },
    });
  });

  it("treats a capitalised admin path as the admin route it is", async () => {
    const { client, inserts } = fakeDb();
    const sent = stubFetch(inserts, () => json({ ok: true }));
    await tool("software_request").run({ client, env: ENV, origin: ORIGIN }, { path: "/api/Admin/audit" });
    expect(await sessionOf(sent[0])).toEqual({ mode: "live", adminId: "owner-1" });
  });

  it("hides credentials in the logged query too", async () => {
    const { client, inserts } = fakeDb();
    stubFetch(inserts, () => json({ ok: true }));
    await tool("software_request").run({ client, env: ENV, origin: ORIGIN }, { method: "POST", path: "/api/admin/x", query: { token: "t", id: "1" } });
    expect(inserts[0]).toMatchObject({ payload: { query: { token: "(hidden)", id: "1" } } });
  });

  it("refuses a file over the cap before reading it, and sends nothing", async () => {
    const { client, inserts } = fakeDb();
    const sent: Sent[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        if (String(url).startsWith("https://cdn.example")) {
          return new Response(new ReadableStream({ pull: () => Promise.reject(new Error("read the body")) }), {
            headers: { "content-type": "video/mp4", "content-length": String(60 * 1024 * 1024) },
          });
        }
        sent.push({ url: String(url), init, logsBefore: inserts.length });
        return json({ ok: true });
      }),
    );
    await expect(
      tool("software_request").run({ client, env: ENV, origin: ORIGIN }, { method: "POST", path: "/api/admin/assets/upload", files: [{ url: "https://cdn.example/big.mp4" }] }),
    ).rejects.toThrow(/50 MB/);
    expect(sent).toHaveLength(0);
  });

  it("stops reading a file with no length header once it passes the cap", async () => {
    const { client } = fakeDb();
    const chunk = new Uint8Array(8 * 1024 * 1024);
    let pulled = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).startsWith("https://cdn.example")) {
          return new Response(new ReadableStream({ pull: (c) => (pulled++, c.enqueue(chunk)) }), { headers: { "content-type": "video/mp4" } });
        }
        return json({ ok: true });
      }),
    );
    await expect(
      tool("software_request").run({ client, env: ENV, origin: ORIGIN }, { method: "POST", path: "/api/admin/assets/upload", files: [{ url: "https://cdn.example/endless.mp4" }] }),
    ).rejects.toThrow(/50 MB/);
    expect(pulled).toBeLessThanOrEqual(8);
  });

  it("deletes too: the whole software, nothing held back by method", async () => {
    const { client, inserts } = fakeDb();
    const sent = stubFetch(inserts, () => json({ ok: true }));
    await tool("software_request").run({ client, env: ENV, origin: ORIGIN }, { method: "DELETE", path: "/api/admin/tasks/abc" });
    expect(sent[0].init.method).toBe("DELETE");
    expect(inserts).toHaveLength(1);
  });

  it("calls a client app route as that client's owner", async () => {
    const { client, inserts } = fakeDb();
    const sent = stubFetch(inserts, () => json({ leads: [] }));
    await tool("software_request").run({ client, env: ENV, origin: ORIGIN }, { client: "aag", path: "/api/leads" });
    expect(await sessionOf(sent[0])).toMatchObject({ mode: "live", tenantId: AAG.id });
    expect((await sessionOf(sent[0]))?.adminId).toBeUndefined();
  });

  it("sends no session to a client route when no client is named", async () => {
    const { client, inserts } = fakeDb();
    const sent = stubFetch(inserts, () => json({ ok: true }));
    await tool("software_request").run({ client, env: ENV, origin: ORIGIN }, { path: "/api/health" });
    expect(new Headers(sent[0].init.headers).get("authorization")).toBeNull();
  });

  it("uploads files as a form, from a link", async () => {
    const { client, inserts } = fakeDb();
    const sent: Sent[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        if (String(url).startsWith("https://cdn.example")) return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } });
        sent.push({ url: String(url), init, logsBefore: inserts.length });
        return json({ ok: true });
      }),
    );
    await tool("software_request").run(
      { client, env: ENV, origin: ORIGIN },
      { client: "aag", method: "POST", path: "/api/admin/clients/:tenantId/picture", body: { note: "hi" }, files: [{ url: "https://cdn.example/a.png" }] },
    );
    const form = sent[0].init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("note")).toBe("hi");
    // The Workers types say FormData.get is a string; at runtime a file entry is a File.
    const file = form.get("file") as unknown as File;
    expect(file.name).toBe("a.png");
    expect(file.type).toBe("image/png");
    expect(file.size).toBe(3);
    expect(inserts[0]).toMatchObject({ payload: { files: [{ field: "file", from: "https://cdn.example/a.png" }] } });
  });
});

describe("software_routes", () => {
  it("lists every route in one answer, and searches the documentation", async () => {
    const deps = { client: fakeDb().client, env: ENV, origin: ORIGIN };
    const all = await tool("software_routes").run(deps, {});
    expect(all).toMatch(/GET,POST \/api\/admin\/clients\/:tenantId\/mission-control/);
    expect(all.length).toBeLessThan(60_000);
    const hits = JSON.parse(await tool("software_routes").run(deps, { search: "mission control docId" }));
    expect(hits.matches.map((r: { path: string }) => r.path)).toContain("/api/admin/clients/:tenantId/mission-control");
    expect(hits.matches[0].about).toMatch(/docId/);
  });
});
