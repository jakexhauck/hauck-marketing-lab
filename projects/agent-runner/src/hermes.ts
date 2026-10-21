// One turn of one chat on Hermes: the agent's own profile on the VPS
// (docs/build-plans/hermes-agents.md). The same contract as runClaude, so the
// runner does not care which engine answered.
//
// Each agent is a Hermes profile (manager, csm, research, ghl, ads) with its
// own memory, skills and past sessions. The Hermes gateway serves every
// profile at /p/<profile>/, and each profile has its own API key, so one
// agent's key cannot drive another.
//
// The chat's session id (agent_chats.claude_session_id) is sent as
// X-Hermes-Session-Id on every turn. Hermes takes a caller's id for a new
// session and loads that session's history for a known one (checked by hand
// 2026-10-21), so there is no create-or-resume flag as with claude. A resumed
// turn first asks whether the session still exists: if the profile was reset,
// the turn fails in claude's words ("No conversation found") and the runner's
// existing fallback starts it again with the chat's history inlined.
//
// The bundle's prompt goes in as the system message. Hermes layers it on top
// of the profile's own prompt for this turn only, so a lesson saved a minute
// ago is in the next answer, as with --append-system-prompt-file. The tools
// are the profile's (its platform_toolsets in config.yaml), not the bundle's
// allowlist: the lock lives on the VPS, set by deploy/vps/profiles.sh.
//
// The answer streams as OpenAI chat chunks, with Hermes's own
// "hermes.tool.progress" events between them for each tool it runs.

import { readFileSync } from "node:fs";
import { PROGRESS_MS, throttle, type RunOptions, type StreamResult } from "./claude.ts";
import type { AgentId } from "./wire.ts";

export interface HermesParser {
  push(line: string): void;
  readonly state: StreamResult;
  // The final chunk arrived (a finish_reason or [DONE]).
  readonly done: boolean;
  // Hermes's own message for an error finish.
  readonly error: string | null;
}

export function createHermesParser(): HermesParser {
  let text = "";
  const tools: string[] = [];
  let event = "";
  let done = false;
  let error: string | null = null;
  return {
    push(raw: string) {
      const line = raw.trimEnd();
      // A blank line ends an SSE event; the next one names its own type.
      if (!line) {
        event = "";
        return;
      }
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
        return;
      }
      if (!line.startsWith("data:")) return;
      const data = line.slice(5).trim();
      if (data === "[DONE]") {
        done = true;
        return;
      }
      let ev: any;
      try {
        ev = JSON.parse(data);
      } catch {
        return;
      }
      if (event === "hermes.tool.progress") {
        if (ev?.status === "running" && typeof ev.tool === "string") tools.push(ev.tool);
        return;
      }
      if (event) return;
      const choice = ev?.choices?.[0];
      if (typeof choice?.delta?.content === "string") text += choice.delta.content;
      if (choice?.finish_reason) done = true;
      if (choice?.finish_reason === "error" || ev?.error) {
        error = typeof ev?.error?.message === "string" ? ev.error.message : "Hermes ended the turn with an error";
      }
    },
    get state() {
      return { text, tools: [...tools], isError: error !== null };
    },
    get done() {
      return done;
    },
    get error() {
      return error;
    },
  };
}

export interface HermesOptions {
  // The gateway, e.g. http://hermes-agent:8642 on the VPS's Docker network.
  base: string;
  // Each profile's API_SERVER_KEY.
  keys: Partial<Record<AgentId, string>>;
  fetchImpl?: typeof fetch;
  // A turn that has not finished by then is abandoned. The app's stale reclaim
  // is ten minutes from the last progress post, so this sits above it only as
  // a last resort for a stream that went silent.
  timeoutMs?: number;
}

export const HERMES_TIMEOUT_MS = 15 * 60_000;

export type HermesRun = (opts: RunOptions & { agent: AgentId }) => Promise<{ text: string; tools: string[] }>;

export function hermesRunner(o: HermesOptions): HermesRun {
  const base = o.base.replace(/\/+$/, "");
  const f = o.fetchImpl ?? fetch;

  return async (opts) => {
    const key = o.keys[opts.agent];
    if (!key) throw new Error(`no Hermes key for ${opts.agent}; set HERMES_KEY_${opts.agent.toUpperCase()}`);
    const auth = { authorization: `Bearer ${key}` };
    const profile = `${base}/p/${opts.agent}`;
    const signal = AbortSignal.timeout(o.timeoutMs ?? HERMES_TIMEOUT_MS);

    if (opts.resume) {
      const res = await f(`${profile}/api/sessions/${encodeURIComponent(opts.sessionId)}`, { headers: auth, signal });
      if (res.status === 404) throw new Error(`No conversation found with session ID ${opts.sessionId} on Hermes ${opts.agent}`);
      if (!res.ok) throw new Error(`hermes ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }

    const res = await f(`${profile}/v1/chat/completions`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json", "x-hermes-session-id": opts.sessionId },
      body: JSON.stringify({
        stream: true,
        messages: [
          { role: "system", content: readFileSync(opts.bundle.systemPromptFile, "utf8") },
          { role: "user", content: opts.prompt },
        ],
      }),
      signal,
    });
    if (!res.ok || !res.body) throw new Error(`hermes ${res.status}: ${(await res.text()).slice(0, 300)}`);

    const parser = createHermesParser();
    const progress = throttle((s: StreamResult) => opts.onProgress(s.text, s.tools), PROGRESS_MS);
    const decoder = new TextDecoder();
    let buf = "";
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      buf += decoder.decode(chunk, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        parser.push(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
        progress.call(parser.state);
      }
    }
    if (buf) parser.push(buf);
    progress.flush();

    const s = parser.state;
    if (parser.error) throw new Error(`hermes ${opts.agent}: ${parser.error}`);
    if (!parser.done) throw new Error(`hermes ${opts.agent}: the stream ended before the answer finished`);
    return { text: s.text, tools: s.tools };
  };
}
