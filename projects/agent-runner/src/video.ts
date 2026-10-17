// The video pipeline: raw talking-head clip to a finished ad, on this PC.
// (The Video Editor plan, folded into docs/build-plans/agents.md, Phase 3.)
//
//   proxy       the raw clip as a 1080x1920 30fps H.264, a keyframe every
//               second (sparse keyframes make HyperFrames freeze frames)
//   transcribe  word timings with parakeet, through the pinned HyperFrames CLI
//   frames      a few stills, for the agent to look at and place the zones
//   build       video/build.mjs: the agent's ad config plus the client's brand
//               into a HyperFrames project
//   render      draft for a preview, standard for the final
//
// The agent never runs any of this. It has no shell; it asks with a ```video
// block and the runner does the work (src/creative.ts). Everything a step
// writes goes inside the agent's own work folder, and every source it reads
// must be inside the client's Drive folder: both are checked here, because the
// paths come from model output.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const HYPERFRAMES = "hyperframes@0.8.140";
export const VIDEO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "video");
export const BUILD_SCRIPT = join(VIDEO_DIR, "build.mjs");

export type RenderMode = "preview" | "final";

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}
export type Exec = (cmd: string, args: string[], opts?: { cwd?: string }) => Promise<ExecResult>;

// npx is a .cmd on Windows, which Node only spawns through a shell. Every
// argument here is ours or a path checked by inside(), and shell: true is
// limited to that one command.
export const exec: Exec = (cmd, args, opts = {}) =>
  new Promise((done, fail) => {
    const shell = process.platform === "win32" && cmd === "npx";
    const quoted = shell ? args.map((a) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)) : args;
    const child = spawn(cmd, quoted, { cwd: opts.cwd, windowsHide: true, shell });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout = (stdout + d).slice(-20_000)));
    child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-20_000)));
    child.on("error", fail);
    child.on("close", (code) => done({ code: code ?? 1, stdout, stderr }));
  });

/** Is `child` the folder `parent` or inside it? Both are resolved first. */
export function inside(child: string, parent: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!!rel && !rel.startsWith("..") && !isAbsolute(rel));
}

// Names the agent picks become file names. Lowercase words and dashes only.
export function safeName(s: unknown): string | null {
  return typeof s === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(s) ? s : null;
}

export function proxyArgs(src: string, out: string): string[] {
  return [
    "-y", "-v", "error", "-i", src,
    "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
    "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-g", "30", "-keyint_min", "30",
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out,
  ];
}

export function audioArgs(proxy: string, wav: string): string[] {
  return ["-y", "-v", "error", "-i", proxy, "-vn", "-ac", "1", "-ar", "16000", wav];
}

export function photoArgs(src: string, out: string): string[] {
  // The template's photos fill a 1080x1920 frame and get zoomed; 1440 wide is
  // enough headroom without carrying 12 MP phone shots into every project.
  return ["-y", "-v", "error", "-i", src, "-vf", "scale='min(1440,iw)':-2", "-q:v", "3", "-frames:v", "1", out];
}

/** Evenly spaced times for n stills, away from the very start and end. */
export function frameTimes(duration: number, n: number): number[] {
  const step = duration / (n + 1);
  return Array.from({ length: n }, (_, i) => Math.round(step * (i + 1) * 100) / 100);
}

export function frameArgs(proxy: string, at: number, out: string): string[] {
  return ["-y", "-v", "error", "-ss", String(at), "-i", proxy, "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "4", out];
}

export function renderArgs(project: string, mode: RenderMode, out: string): string[] {
  // Final: the settings the nine AAG ads were rendered at (30fps, standard).
  // Two workers: this PC is short on memory and each worker is a Chrome.
  return ["--yes", HYPERFRAMES, "render", project, "-q", mode === "final" ? "standard" : "draft", "--workers", "2", "-o", out];
}

// Previews only need to be watchable in the card. Half size keeps the upload
// small and well under the bucket's 50 MB cap.
export function shrinkArgs(src: string, out: string): string[] {
  return ["-y", "-v", "error", "-i", src, "-vf", "scale=540:960", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", out];
}

export interface Word {
  text: string;
  start: number;
  end: number;
}

/** The transcript as timestamped lines, broken on pauses, for the agent to cut from. */
export function transcriptLines(words: Word[], gap = 0.6): string {
  const fmt = (s: number) => s.toFixed(2);
  const out: string[] = [];
  let line: Word[] = [];
  const flush = () => {
    if (line.length) out.push(`${fmt(line[0].start)}-${fmt(line[line.length - 1].end)}  ${line.map((w) => w.text).join(" ")}`);
    line = [];
  };
  for (const w of words) {
    if (line.length && w.start - line[line.length - 1].end >= gap) {
      const pause = w.start - line[line.length - 1].end;
      flush();
      out.push(`[pause ${pause.toFixed(1)}s]`);
    }
    line.push(w);
  }
  flush();
  return out.join("\n");
}

/** A build failure the agent can fix by editing its config, or null. */
export function fixableBuildError(stderr: string): string | null {
  const m = /(phrase not found: "[^"]*" \(after [^)]*\)|photo not found: "[^"]*"[^\n]*|source time not in edit: [\d.]+)/.exec(stderr);
  return m ? m[1] : null;
}

async function run(x: Exec, cmd: string, args: string[], what: string, cwd?: string): Promise<ExecResult> {
  const r = await x(cmd, args, { cwd });
  if (r.code !== 0) throw new Error(`${what} failed: ${(r.stderr || r.stdout).trim().split("\n").slice(-6).join("\n")}`);
  return r;
}

// Where each step writes, inside the work folder.
export const workPaths = (workDir: string, name: string) => ({
  proxy: join(workDir, "proxies", `${name}.mp4`),
  wav: join(workDir, "audio", name, `${name}.wav`),
  transcript: join(workDir, "tx", `${name}.json`),
  lines: join(workDir, "tx", `${name}.txt`),
  frames: join(workDir, "frames", name),
});

export async function proxy(x: Exec, src: string, out: string): Promise<void> {
  mkdirSync(dirname(out), { recursive: true });
  await run(x, "ffmpeg", proxyArgs(src, out), "proxy");
}

// The CLI always writes transcript.json beside its input, so each clip's audio
// gets its own folder and the file is moved into place afterwards.
export async function transcribe(x: Exec, proxyFile: string, wav: string, out: string): Promise<void> {
  mkdirSync(dirname(wav), { recursive: true });
  mkdirSync(dirname(out), { recursive: true });
  await run(x, "ffmpeg", audioArgs(proxyFile, wav), "audio");
  await run(x, "npx", ["--yes", HYPERFRAMES, "transcribe", wav, "--engine", "parakeet", "--json"], "transcribe");
  const made = join(dirname(wav), "transcript.json");
  if (!existsSync(made)) throw new Error("transcribe failed: no transcript.json");
  renameSync(made, out);
}

export async function probeDuration(x: Exec, file: string): Promise<number> {
  const r = await run(x, "ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], "probe");
  const n = Number(r.stdout.trim());
  if (!Number.isFinite(n) || n <= 0) throw new Error(`probe failed: no duration for ${file}`);
  return n;
}

export async function frames(x: Exec, proxyFile: string, outDir: string, n = 4): Promise<string[]> {
  mkdirSync(outDir, { recursive: true });
  const times = frameTimes(await probeDuration(x, proxyFile), n);
  const files: string[] = [];
  for (const [i, at] of times.entries()) {
    const f = join(outDir, `f${i + 1}-at-${at}s.jpg`);
    await run(x, "ffmpeg", frameArgs(proxyFile, at, f), "frames");
    files.push(f);
  }
  return files;
}

export interface BuildInput {
  config: string;
  brandFile: string;
  proxy: string;
  transcript: string;
  out: string;
}

export async function buildProject(x: Exec, b: BuildInput): Promise<string> {
  const r = await x(process.execPath, [BUILD_SCRIPT, b.config, "--brand", b.brandFile, "--proxy", b.proxy, "--transcript", b.transcript, "--out", b.out]);
  if (r.code !== 0) {
    const fix = fixableBuildError(r.stderr);
    throw new BuildError(fix ?? `build failed: ${r.stderr.trim().split("\n").slice(-4).join("\n")}`, fix !== null);
  }
  return r.stdout.trim();
}

export class BuildError extends Error {
  constructor(
    message: string,
    readonly fixable: boolean,
  ) {
    super(message);
  }
}

export async function render(x: Exec, project: string, mode: RenderMode): Promise<string> {
  const out = join(project, "renders", `${mode}.mp4`);
  await run(x, "npx", renderArgs(project, mode, out), `${mode} render`, project);
  if (mode === "final") return out;
  const small = join(project, "renders", "preview-small.mp4");
  await run(x, "ffmpeg", shrinkArgs(out, small), "preview shrink");
  return small;
}
