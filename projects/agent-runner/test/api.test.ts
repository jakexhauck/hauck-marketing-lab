import { describe, expect, it } from "vitest";
import { createApi } from "../src/api.ts";

function recorder(responses: { status?: number; body?: unknown; text?: string }[]) {
  const calls: { url: string; method: string; headers: Record<string, string>; body: unknown }[] = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const r = responses.shift() ?? {};
    const text = r.text ?? (r.body === undefined ? "" : JSON.stringify(r.body));
    const status = r.status ?? 200;
    return new Response(status === 204 ? null : text, { status });
  };
  return { calls, fetchImpl: fetchImpl as typeof fetch };
}

describe("createApi", () => {
  it("sends the secret header to the exact runner paths", async () => {
    const { calls, fetchImpl } = recorder([
      { body: null },
      { body: { lastMonitorAt: null, queuedEdits: [] } },
      { body: { cpl: 1 } },
      { body: { chatId: "c1" } },
      { body: [] },
    ]);
    const api = createApi({ base: "https://app.example.com/", secret: "s3cret", fetch: fetchImpl });
    expect(await api.claim("PC")).toBeNull();
    await api.heartbeat({ host: "PC", monitored: true });
    await api.snapshot("t 1");
    expect(await api.autoChat({ tenantId: "t1", agent: "ads", title: "Startup check", prompt: "p" })).toEqual({
      chatId: "c1",
    });
    await api.tenants();
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST https://app.example.com/api/agent-runner/claim",
      "POST https://app.example.com/api/agent-runner/heartbeat",
      "GET https://app.example.com/api/agent-runner/snapshot?tenant=t%201",
      "POST https://app.example.com/api/agent-runner/auto-chat",
      "GET https://app.example.com/api/agent-runner/tenants",
    ]);
    for (const c of calls) expect(c.headers["x-agent-runner-secret"]).toBe("s3cret");
    expect(calls[0].body).toEqual({ host: "PC" });
  });

  it("treats an empty body or 204 from claim as nothing queued", async () => {
    const { fetchImpl } = recorder([{ status: 204, text: "" }]);
    const api = createApi({ base: "https://a", secret: "s", fetch: fetchImpl });
    expect(await api.claim("PC")).toBeNull();
  });

  it("throws with the status and body on an error", async () => {
    const { fetchImpl } = recorder([{ status: 401, text: "unauthorized" }]);
    const api = createApi({ base: "https://a", secret: "s", fetch: fetchImpl });
    await expect(api.reply({ messageId: "m", status: "done" })).rejects.toThrow(/401.*unauthorized/);
  });

  it("posts a brief section and reads a 409 as stale, not as a failure", async () => {
    const section = { section: "ads", body: "Jake's text", version: 4, updatedBy: "jake", updatedAt: "2026-10-17T10:00:00Z" };
    const { calls, fetchImpl } = recorder([
      { body: { section: { ...section, body: "mine", version: 4, updatedBy: "ads" } } },
      { status: 409, body: { section } },
      { status: 500, text: "boom" },
    ]);
    const api = createApi({ base: "https://app.example.com", secret: "s3cret", fetch: fetchImpl });
    expect(await api.brief({ messageId: "m1", body: "mine", version: 3 })).toMatchObject({ saved: true, section: { body: "mine" } });
    expect(await api.brief({ messageId: "m1", body: "mine", version: 3 })).toEqual({ saved: false, section });
    await expect(api.brief({ messageId: "m1", body: "mine", version: 3 })).rejects.toThrow(/500/);
    expect(calls[0]).toMatchObject({ url: "https://app.example.com/api/agent-runner/brief", method: "POST", body: { messageId: "m1", body: "mine", version: 3 } });
  });
});
