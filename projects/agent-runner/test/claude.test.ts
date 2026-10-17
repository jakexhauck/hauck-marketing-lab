import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { claudeArgs, parseStream, runClaude, throttle } from "../src/claude.ts";

// Recorded from one real `claude -p ... --output-format stream-json --verbose`
// run (Claude Code 2.1.302) that called Bash once. The SessionStart hook's
// text was trimmed out of the recording; nothing else was touched.
const FIXTURE = readFileSync(join(import.meta.dirname, "fixtures", "stream.jsonl"), "utf8");

const bundle = {
  systemPromptFile: "C:/runner/data/prompts/ads-willis-windows.md",
  allowedTools: ["Read", "Bash(node bin/meta.mjs:*)"],
  addDirs: ["G:/My Drive/x"],
  workDir: "C:/runner/data/work/ads-willis-windows",
};

describe("parseStream", () => {
  it("turns the recorded stream into text and tool names", () => {
    const out = parseStream(FIXTURE);
    expect(out.text).toBe('I ran `echo hi` and it printed "hi".');
    expect(out.tools).toEqual(["Bash"]);
    expect(out.isError).toBe(false);
  });

  it("skips lines that are not JSON", () => {
    const out = parseStream('garbage\n{"type":"assistant","message":{"content":[{"type":"text","text":"hi"}]}}\n');
    expect(out.text).toBe("hi");
  });
});

describe("claudeArgs", () => {
  it("starts a new session on the first turn", () => {
    const args = claudeArgs({ sessionId: "s-1", resume: false, bundle });
    expect(args.slice(0, 4)).toEqual(["-p", "--output-format", "stream-json", "--verbose"]);
    expect(args).toContain("--append-system-prompt-file");
    expect(args[args.indexOf("--append-system-prompt-file") + 1]).toBe(bundle.systemPromptFile);
    expect(args[args.indexOf("--session-id") + 1]).toBe("s-1");
    expect(args).not.toContain("--resume");
    const at = args.indexOf("--allowedTools");
    expect(args.slice(at + 1, at + 3)).toEqual(bundle.allowedTools);
    const dirs = args.indexOf("--add-dir");
    expect(args.slice(dirs + 1, dirs + 2)).toEqual(bundle.addDirs);
  });

  it("locks claude down: restricted, no MCP, nothing outside the allowlist", () => {
    const args = claudeArgs({ sessionId: "s-1", resume: false, bundle });
    expect(args).toContain("--restricted");
    expect(args).toContain("--strict-mcp-config");
    expect(args[args.indexOf("--permission-mode") + 1]).toBe("dontAsk");
    // --tools names the base tools, so Bash exists only because the meta rule asks for it.
    expect(args[args.indexOf("--tools") + 1]).toBe("Read,Bash");
    expect(args).not.toContain("bypassPermissions");
  });

  it("resumes after the first turn", () => {
    const args = claudeArgs({ sessionId: "s-1", resume: true, bundle });
    expect(args[args.indexOf("--resume") + 1]).toBe("s-1");
    expect(args).not.toContain("--session-id");
  });
});

describe("throttle", () => {
  it("passes one call per window and flushes the last one", () => {
    let t = 0;
    const seen: number[] = [];
    const th = throttle((n: number) => seen.push(n), 1500, () => t);
    th.call(1);
    t = 500;
    th.call(2);
    t = 1000;
    th.call(3);
    t = 1600;
    th.call(4);
    th.flush();
    expect(seen).toEqual([1, 4]);
    th.call(5);
    th.flush();
    expect(seen).toEqual([1, 4, 5]);
  });
});

function fakeSpawn(stdout: string, code = 0, stderr = "") {
  const calls: { cmd: string; args: string[]; input: string }[] = [];
  const spawnImpl = (cmd: string, args: string[]) => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: PassThrough;
      stderr: PassThrough;
      stdin: PassThrough;
    };
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    const call = { cmd, args, input: "" };
    calls.push(call);
    child.stdin.on("data", (d) => (call.input += d));
    setImmediate(() => {
      child.stdout.end(stdout);
      child.stderr.end(stderr);
      setImmediate(() => child.emit("close", code));
    });
    return child;
  };
  return { spawnImpl, calls };
}

describe("runClaude", () => {
  it("sends the prompt on stdin and returns the parsed reply", async () => {
    const { spawnImpl, calls } = fakeSpawn(FIXTURE);
    const progress: string[] = [];
    const out = await runClaude({
      sessionId: "s-1",
      resume: false,
      prompt: "say hi",
      bundle,
      onProgress: (text) => progress.push(text),
      spawnImpl,
    });
    expect(out.text).toBe('I ran `echo hi` and it printed "hi".');
    expect(out.tools).toEqual(["Bash"]);
    expect(calls[0].input).toBe("say hi");
    expect(progress.length).toBeGreaterThan(0);
  });

  it("rejects with stderr when claude fails", async () => {
    const { spawnImpl } = fakeSpawn("", 1, "No conversation found with session ID: s-1");
    await expect(
      runClaude({ sessionId: "s-1", resume: true, prompt: "x", bundle, onProgress: () => {}, spawnImpl }),
    ).rejects.toThrow(/No conversation found/);
  });
});
