// One turn of one chat: `claude -p` on Jake's subscription.
//
// Each chat owns a Claude session id (agent_chats.claude_session_id). The first
// turn creates the session with --session-id; every turn after resumes it with
// --resume, so the agent remembers the conversation without the runner
// replaying it.
//
// The prompt goes in on stdin, not as an argument. --allowedTools and --add-dir
// take a list, and a prompt placed after them would be read as one more tool or
// one more folder. stdin also sidesteps Windows' command-line length limit for
// a long message.
//
// stream-json with --verbose is one JSON event per line: assistant messages
// (text and tool_use parts), tool results, and a final "result" event carrying
// the finished reply. Progress is pushed to the chat as it arrives, throttled,
// so Jake watches the agent work instead of staring at a spinner.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Readable, Writable } from "node:stream";

export interface Bundle {
  systemPromptFile: string;
  allowedTools: string[];
  addDirs: string[];
  // Where claude runs. Its own folder per agent and client, outside the
  // runner's code, so the file tools cannot reach src/, bin/ or agents/.
  workDir: string;
  // Refused even if an allow rule would match. The Ads Agent's paid
  // Higgsfield tools sit here unless the turn carries an approved spend grant.
  disallowedTools?: string[];
  // An MCP config file holding only the servers this agent may use. Loaded
  // alongside --strict-mcp-config, so nothing from Jake's own config comes in.
  mcpConfig?: string;
}

export interface StreamResult {
  text: string;
  tools: string[];
  isError: boolean;
}

export interface StreamParser {
  push(line: string): void;
  readonly state: StreamResult;
}

export function createStreamParser(): StreamParser {
  const texts: string[] = [];
  const tools: string[] = [];
  let final: string | null = null;
  let isError = false;
  return {
    push(line: string) {
      let ev: any;
      try {
        ev = JSON.parse(line);
      } catch {
        return;
      }
      if (ev?.type === "assistant" && Array.isArray(ev.message?.content)) {
        for (const part of ev.message.content) {
          if (part?.type === "text" && typeof part.text === "string") texts.push(part.text);
          if (part?.type === "tool_use" && typeof part.name === "string") tools.push(part.name);
        }
      } else if (ev?.type === "result") {
        if (typeof ev.result === "string") final = ev.result;
        isError = ev.is_error === true;
      }
    },
    get state() {
      return { text: final ?? texts.join("\n\n"), tools: [...tools], isError };
    },
  };
}

export function parseStream(output: string): StreamResult {
  const p = createStreamParser();
  for (const line of output.split(/\r?\n/)) if (line.trim()) p.push(line);
  return p.state;
}

export function claudeArgs(o: { sessionId: string; resume: boolean; bundle: Bundle }): string[] {
  const args = ["-p", "--output-format", "stream-json", "--verbose"];
  // The lock. --restricted ignores Jake's own settings (his default is auto
  // mode, which would let a model decide what to run), keeps the file tools
  // inside the work folder and --add-dir, and drops every command tool not
  // named in --tools. --strict-mcp-config with no --mcp-config loads no MCP
  // servers (no Gmail, no Composio). dontAsk refuses anything the allowlist
  // does not cover, since nobody is at a prompt. Checked by hand 2026-10-17:
  // a Read and a Write outside the folder, `cat` of a home file and an
  // arbitrary `node -e` were all refused; the meta script ran.
  args.push("--restricted", "--strict-mcp-config", "--permission-mode", "dontAsk");
  // Strict still loads a config named here, and only that one. Checked by
  // hand 2026-10-17 with the Higgsfield server: it connected headless on the
  // OAuth login already in Claude's credential store, an allowed tool ran,
  // and the server's other tools were listed but refused under dontAsk.
  if (o.bundle.mcpConfig) args.push("--mcp-config", o.bundle.mcpConfig);
  // MCP tools are not built-ins: --tools only takes built-in names.
  const base = [
    ...new Set(o.bundle.allowedTools.filter((t) => !t.startsWith("mcp__")).map((t) => t.replace(/\(.*$/, ""))),
  ];
  if (base.length) args.push("--tools", base.join(","));
  args.push("--append-system-prompt-file", o.bundle.systemPromptFile);
  if (o.resume) args.push("--resume", o.sessionId);
  else args.push("--session-id", o.sessionId);
  if (o.bundle.allowedTools.length) args.push("--allowedTools", ...o.bundle.allowedTools);
  if (o.bundle.disallowedTools?.length) args.push("--disallowedTools", ...o.bundle.disallowedTools);
  if (o.bundle.addDirs.length) args.push("--add-dir", ...o.bundle.addDirs);
  return args;
}

// One call per window; the latest call inside a window is kept and sent by
// flush(), so the final state always lands even when it came in early.
export function throttle<A extends unknown[]>(fn: (...a: A) => void, ms: number, now: () => number = Date.now) {
  let last = -Infinity;
  let pending: A | null = null;
  return {
    call(...a: A) {
      if (now() - last >= ms) {
        last = now();
        pending = null;
        fn(...a);
      } else {
        pending = a;
      }
    },
    flush() {
      if (pending) {
        const a = pending;
        pending = null;
        last = now();
        fn(...a);
      }
    },
  };
}

// npm installs claude as a .cmd shim, and Node will not spawn a .cmd without a
// shell (which would then re-parse every argument, folder names with spaces
// and emoji included). The shim only forwards to claude.exe, so call that.
export function claudeBin(): string {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  if (process.platform === "win32" && process.env.APPDATA) {
    const exe = join(process.env.APPDATA, "npm", "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
    if (existsSync(exe)) return exe;
  }
  return "claude";
}

interface ChildLike {
  stdout: Readable;
  stderr: Readable;
  stdin: Writable;
  on(ev: "close", fn: (code: number | null) => void): unknown;
  on(ev: "error", fn: (err: Error) => void): unknown;
}

export type SpawnLike = (cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv }) => ChildLike;

export interface RunOptions {
  sessionId: string;
  resume: boolean;
  prompt: string;
  bundle: Bundle;
  onProgress: (text: string, tools: string[]) => void;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  spawnImpl?: SpawnLike;
}

export const PROGRESS_MS = 1_500;

export function runClaude(opts: RunOptions): Promise<{ text: string; tools: string[] }> {
  const spawnImpl: SpawnLike =
    opts.spawnImpl ?? ((cmd, args, o) => spawn(cmd, args, { ...o, windowsHide: true }) as unknown as ChildLike);
  const child = spawnImpl(claudeBin(), claudeArgs(opts), { cwd: opts.cwd, env: opts.env });
  const parser = createStreamParser();
  const progress = throttle((s: StreamResult) => opts.onProgress(s.text, s.tools), PROGRESS_MS);
  let buf = "";
  let stderr = "";

  return new Promise((resolve, reject) => {
    child.stdout.on("data", (d: Buffer | string) => {
      buf += d.toString();
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        parser.push(line);
        progress.call(parser.state);
      }
    });
    child.stderr.on("data", (d: Buffer | string) => {
      // Keep the tail only: it is for the error message, not a log.
      stderr = (stderr + d.toString()).slice(-4000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (buf.trim()) parser.push(buf.trim());
      progress.flush();
      const s = parser.state;
      if (code !== 0 || (s.isError && !s.text)) {
        reject(new Error(`claude exited ${code}: ${stderr.trim() || s.text || "no output"}`));
      } else {
        resolve({ text: s.text, tools: s.tools });
      }
    });
    child.stdin.end(opts.prompt);
  });
}
