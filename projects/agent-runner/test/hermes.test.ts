import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Bundle } from "../src/claude.ts";
import { createHermesParser, hermesRunner } from "../src/hermes.ts";

const FIXTURE = readFileSync(join(import.meta.dirname, "fixtures", "hermes-stream.sse"), "utf8");
const FINAL =
  "The search found at least 506 entries in /tmp, counting subfolders, but that's a minimum because the tool cut the list off; almost all of them are Node's compile cache in /tmp/node-compile-cache, and the top level has only about 10 items.";

function bundle(): Bundle {
  const dir = mkdtempSync(join(tmpdir(), "hermes-"));
  const systemPromptFile = join(dir, "prompt.md");
  writeFileSync(systemPromptFile, "You are the CSM.");
  return { systemPromptFile, allowedTools: ["Read"], addDirs: [], workDir: dir };
}

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: any;
}

// A fetch that answers session lookups with `sessionStatus` and every chat
// with `sse`, split into small chunks so the parser has to join lines.
function fakeFetch(sse: string, o: { status?: number; sessionStatus?: number } = {}) {
  const calls: Call[] = [];
  const impl = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (String(url).includes("/api/sessions/")) return new Response("{}", { status: o.sessionStatus ?? 200 });
    if (o.status && o.status >= 400) return new Response("upstream broke", { status: o.status });
    const bytes = new TextEncoder().encode(sse);
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < bytes.length; i += 37) c.enqueue(bytes.slice(i, i + 37));
        c.close();
      },
    });
    return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  return { calls, impl: impl as typeof fetch };
}

const run = (fetchImpl: typeof fetch, over: Record<string, unknown> = {}) =>
  hermesRunner({ base: "http://hermes:8642/", keys: { csm: "k-csm" }, fetchImpl })({
    agent: "csm",
    sessionId: "sess-1",
    resume: false,
    prompt: "How many files?",
    bundle: bundle(),
    onProgress: () => {},
    ...over,
  });

describe("createHermesParser", () => {
  it("reads the captured stream: text, tools, done", () => {
    const p = createHermesParser();
    for (const line of FIXTURE.split(/\r?\n/)) p.push(line);
    expect(p.state).toEqual({ text: FINAL, tools: ["search_files"], isError: false });
    expect(p.done).toBe(true);
  });

  it("joins text deltas without separators", () => {
    const p = createHermesParser();
    for (const c of ["Hel", "lo"]) p.push(`data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}`);
    expect(p.state.text).toBe("Hello");
  });

  it("marks an error finish with Hermes's message", () => {
    const p = createHermesParser();
    p.push(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "error" }], error: { message: "content_policy_blocked" } })}`);
    expect(p.state.isError).toBe(true);
    expect(p.error).toBe("content_policy_blocked");
  });
});

describe("hermesRunner", () => {
  it("posts the turn to the agent's profile with the bundle as the system message", async () => {
    const f = fakeFetch(FIXTURE);
    const res = await run(f.impl);
    expect(res).toEqual({ text: FINAL, tools: ["search_files"] });
    const chat = f.calls.find((c) => c.method === "POST")!;
    expect(chat.url).toBe("http://hermes:8642/p/csm/v1/chat/completions");
    expect(chat.headers.authorization).toBe("Bearer k-csm");
    expect(chat.headers["x-hermes-session-id"]).toBe("sess-1");
    expect(chat.body).toEqual({
      stream: true,
      messages: [
        { role: "system", content: "You are the CSM." },
        { role: "user", content: "How many files?" },
      ],
    });
  });

  it("pushes progress as the stream arrives", async () => {
    const seen: string[][] = [];
    await run(fakeFetch(FIXTURE).impl, { onProgress: (_t: string, tools: string[]) => seen.push(tools) });
    expect(seen.at(-1)).toEqual(["search_files"]);
  });

  it("checks a resumed session still exists, and says so in the claude engine's words when it does not", async () => {
    const f = fakeFetch(FIXTURE, { sessionStatus: 404 });
    await expect(run(f.impl, { resume: true })).rejects.toThrow(/no conversation found/i);
    expect(f.calls.map((c) => c.url)).toEqual(["http://hermes:8642/p/csm/api/sessions/sess-1"]);
  });

  it("resumes a session that exists", async () => {
    const f = fakeFetch(FIXTURE);
    await run(f.impl, { resume: true });
    expect(f.calls.map((c) => c.method)).toEqual(["GET", "POST"]);
  });

  it("rejects an HTTP error with the status and body", async () => {
    await expect(run(fakeFetch("", { status: 502 }).impl)).rejects.toThrow(/hermes 502: upstream broke/);
  });

  it("rejects a stream that ends without finishing", async () => {
    const cut = FIXTURE.split("\n").slice(0, 4).join("\n");
    await expect(run(fakeFetch(cut).impl)).rejects.toThrow(/ended before the answer finished/);
  });

  it("rejects an error finish with Hermes's message", async () => {
    const sse = `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "error" }], error: { message: "content_policy_blocked" } })}\n\ndata: [DONE]\n\n`;
    await expect(run(fakeFetch(sse).impl)).rejects.toThrow(/content_policy_blocked/);
  });

  it("refuses an agent with no key rather than calling Hermes unauthenticated", async () => {
    const f = fakeFetch(FIXTURE);
    await expect(run(f.impl, { agent: "ghl" })).rejects.toThrow(/no Hermes key for ghl/);
    expect(f.calls).toEqual([]);
  });
});
