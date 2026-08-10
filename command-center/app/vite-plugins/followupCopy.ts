import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Plugin } from "vite";

// Dev-only copy generation for Fulfillment > GHL > Follow Up Creation.
//
// WHY THIS IS A VITE PLUGIN AND NOT AN API ROUTE: the app's API is Cloudflare
// Pages Functions, which run on workerd. workerd cannot spawn a process, so
// `claude -p` is impossible there no matter how it is written. The Vite dev
// server is plain Node, so it can. That is the whole reason this file exists,
// and it is also why the Generate button has to degrade to "copy the prompt"
// in production rather than pretending to work.
//
// No API key anywhere. The CLI uses Jake's own Claude Code credentials, so the
// tokens come out of the allowance he is already paying for.
//
// The prompt is written to the child's STDIN, never to argv. Nothing an
// operator types is ever interpolated into a command line, so there is no
// shell-injection surface even with `shell: true` on Windows (needed there to
// resolve claude.cmd off PATH).

const ROUTE = "/__local/followup-copy";

// Generation runs from an empty scratch directory, NOT the repo. Running it in
// the project loads CLAUDE.md, every skill and the MCP servers as context: the
// first measured call cost $0.24 and returned seven tokens. From a bare
// directory the same generation is about half that.
const SCRATCH = join(tmpdir(), "hml-followup-copy");

// Nothing here needs to touch the disk or the network: it is a copywriting
// task with everything it needs in the prompt. Denying the tools outright
// means a prompt that somehow asked for a file read cannot get one.
const DENIED_TOOLS = [
  "Bash",
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "Task",
];

// Generation takes ~20s. Sixty gives it room without letting a wedged CLI hold
// a dev-server connection open forever.
const TIMEOUT_MS = 60_000;

// Far past any real brief. A cap at all, so a runaway client cannot stream an
// unbounded body into a subprocess.
const MAX_PROMPT = 20_000;

// The dev server binds host:true so a phone on the same wifi can load the app.
// That also exposes this route to the LAN, and this route runs a program. Only
// loopback may call it.
function isLoopback(address: string | undefined): boolean {
  if (!address) return false;
  const host = address.replace(/^::ffff:/, "");
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

interface CliResult {
  result?: string;
  is_error?: boolean;
  total_cost_usd?: number;
  duration_ms?: number;
}

function runClaude(prompt: string): Promise<{ text: string; costUsd: number }> {
  return new Promise((resolve, reject) => {
    mkdirSync(SCRATCH, { recursive: true });

    const child = spawn(
      "claude",
      [
        "-p",
        "--output-format",
        "json",
        "--model",
        "claude-opus-5",
        // Do not load the user's MCP servers: they are irrelevant here and
        // their tool schemas are pure context cost on every call.
        "--strict-mcp-config",
        "--disallowedTools",
        ...DENIED_TOOLS,
      ],
      {
        cwd: SCRATCH,
        shell: process.platform === "win32",
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Claude took too long and was stopped."));
    }, TIMEOUT_MS);

    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));

    // A missing CLI arrives here as ENOENT, which is the single most likely
    // failure on a fresh machine and deserves its own sentence.
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(
        (err as NodeJS.ErrnoException).code === "ENOENT"
          ? new Error("The `claude` CLI is not on PATH.")
          : err,
      );
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `claude exited with code ${code}`));
        return;
      }
      let parsed: CliResult;
      try {
        parsed = JSON.parse(stdout) as CliResult;
      } catch {
        reject(new Error("Could not read the CLI's response."));
        return;
      }
      if (parsed.is_error || typeof parsed.result !== "string") {
        reject(new Error(parsed.result || "Claude returned an error."));
        return;
      }
      resolve({ text: parsed.result, costUsd: parsed.total_cost_usd ?? 0 });
    });

    child.stdin.end(prompt);
  });
}

export function followupCopyPlugin(): Plugin {
  return {
    name: "hml-followup-copy",
    // Dev only. There is deliberately no build-time equivalent: see the note
    // at the top about workerd.
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(ROUTE, (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(body));
        };

        if (req.method !== "POST") {
          send(405, { error: "POST only" });
          return;
        }
        if (!isLoopback(req.socket.remoteAddress)) {
          send(403, { error: "localhost only" });
          return;
        }

        let raw = "";
        let tooLong = false;
        req.on("data", (chunk) => {
          if (tooLong) return;
          raw += String(chunk);
          if (raw.length > MAX_PROMPT) {
            tooLong = true;
            send(413, { error: "prompt too long" });
            req.destroy();
          }
        });

        req.on("end", () => {
          if (tooLong) return;
          let prompt = "";
          try {
            prompt = String((JSON.parse(raw) as { prompt?: unknown }).prompt ?? "");
          } catch {
            send(400, { error: "invalid body" });
            return;
          }
          if (!prompt.trim()) {
            send(400, { error: "prompt is required" });
            return;
          }

          runClaude(prompt)
            .then(({ text, costUsd }) => send(200, { text, costUsd }))
            .catch((err: Error) => send(502, { error: err.message }));
        });
      });
    },
  };
}
