// Cloudflare Pages for the Landing Page Agent. The RUNNER deploys, never the
// agent: wrangler is in no agent's tools, and the agent never learns more than
// the URL that came back.
//
//   project   hm-<client slug>, one per client, created on first use
//   draft     --branch d-<itemId8>  gives https://d-<itemId8>.<project>.pages.dev
//   live      --branch main         gives https://<project>.pages.dev
//
// What goes up is a SNAPSHOT the runner copied out of the agent's work folder
// (snapshotSite), into a folder the agent cannot write to. The draft Jake saw
// and the page that goes live are the same files, because the agent cannot
// touch the snapshot between the two.
//
// Pages runs code it finds next to a static site: a _worker.js (or folder of
// that name) in the deploy folder, and a ./functions folder in wrangler's
// working folder. Either would let model-written text run as a Worker on
// Jake's account. So the snapshot keeps static file types only and drops every
// root name starting with "_", and wrangler runs in an empty folder the runner
// owns, never in the site.
//
// Wrangler uses the PC's own `wrangler login` (pages write), the same one the
// cron Workers deploy with. Output format recorded 2026-10-17 from wrangler
// 4.91.0 against a throwaway project (test/fixtures/wrangler-*.txt):
//
//   Take a peek over at https://5d1df8db.hm-zz-test.pages.dev
//   Deployment alias URL: https://d-1234abcd.hm-zz-test.pages.dev

import { execFile } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { extname, join } from "node:path";

export interface WranglerResult {
  code: number;
  stdout: string;
  stderr: string;
}
export type WranglerExec = (args: string[], cwd: string) => Promise<WranglerResult>;

export interface PagesOptions {
  exec?: WranglerExec;
  // Wrangler's working folder: empty, runner-owned. See the note at the top.
  cwd: string;
  // Projects already made this run, so wrangler is asked once each.
  known?: Set<string>;
}

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
// Pages project names are at most 58 characters.
const MAX_PROJECT = 58;

export function projectName(slug: string): string {
  const name = `hm-${slug}`;
  if (!SLUG.test(slug) || name.length > MAX_PROJECT) throw new Error(`not a usable client slug for Pages: ${slug}`);
  return name;
}

export function draftBranch(itemId: string): string {
  const hex = itemId.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{8,}$/.test(hex)) throw new Error(`not an item id: ${itemId}`);
  return `d-${hex.slice(0, 8)}`;
}

const ANSI = /\u001b\[[0-9;]*m/g;
const PAGES_URL = /https:\/\/[a-z0-9.-]+\.pages\.dev\b/i;

export function parseDeployUrls(stdout: string): { deployment: string | null; alias: string | null } {
  let deployment: string | null = null;
  let alias: string | null = null;
  for (const line of stdout.replace(ANSI, "").split(/\r?\n/)) {
    const url = line.match(PAGES_URL)?.[0] ?? null;
    if (!url) continue;
    if (/alias/i.test(line)) alias ??= url;
    else deployment ??= url;
  }
  return { deployment, alias };
}

/** The URL to show: the branch alias when there is one, else the deployment's own. */
export function parseDeployUrl(stdout: string): string | null {
  const u = parseDeployUrls(stdout);
  return u.alias ?? u.deployment;
}

/** https://<anything>.<project>.pages.dev -> https://<project>.pages.dev */
export function liveUrlOf(deployUrl: string): string | null {
  const m = deployUrl.match(/^https:\/\/[a-z0-9-]+\.([a-z0-9-]+)\.pages\.dev\/?$/i);
  return m ? `https://${m[1].toLowerCase()}.pages.dev` : null;
}

// The global npm install puts a .cmd shim on PATH, and Node will not spawn a
// .cmd without a shell (see claudeBin in claude.ts). Run its script with node.
export function wranglerCommand(): { cmd: string; pre: string[] } {
  if (process.env.WRANGLER_BIN) return { cmd: process.execPath, pre: [process.env.WRANGLER_BIN] };
  if (process.platform === "win32" && process.env.APPDATA) {
    const js = join(process.env.APPDATA, "npm", "node_modules", "wrangler", "bin", "wrangler.js");
    if (existsSync(js)) return { cmd: process.execPath, pre: [js] };
  }
  return { cmd: "wrangler", pre: [] };
}

export const defaultExec: WranglerExec = (args, cwd) => {
  const { cmd, pre } = wranglerCommand();
  const env = { ...process.env };
  delete env.AGENT_RUNNER_SECRET;
  return new Promise((resolve) => {
    execFile(cmd, [...pre, ...args], { cwd, env, windowsHide: true, timeout: 5 * 60_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === "number" ? ((err as { code: number }).code) : 1) : 0;
      resolve({ code, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") || (err && code !== 0 ? err.message : "") });
    });
  });
};

const tail = (r: WranglerResult) => (r.stderr + "\n" + r.stdout).replace(ANSI, "").trim().slice(-600);

const knownDefault = new Set<string>();

export async function ensureProject(slug: string, o: PagesOptions): Promise<void> {
  const name = projectName(slug);
  const known = o.known ?? knownDefault;
  if (known.has(name)) return;
  const exec = o.exec ?? defaultExec;
  mkdirSync(o.cwd, { recursive: true });
  let last: WranglerResult | null = null;
  // Twice: the first create on 2026-10-17 failed with Cloudflare's "unknown
  // error" [code: 8000000] and the very next one went through.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    last = await exec(["pages", "project", "create", name, "--production-branch", "main"], o.cwd);
    if (last.code === 0 || /already exists|8000002/i.test(last.stdout + last.stderr)) {
      known.add(name);
      return;
    }
  }
  throw new Error(`Pages project ${name} could not be made: ${tail(last!)}`);
}

async function deploy(slug: string, dir: string, branch: string, o: PagesOptions): Promise<{ deployment: string | null; alias: string | null }> {
  await ensureProject(slug, o);
  const exec = o.exec ?? defaultExec;
  const r = await exec(
    ["pages", "deploy", dir, "--project-name", projectName(slug), "--branch", branch, "--commit-dirty=true"],
    o.cwd,
  );
  if (r.code !== 0) throw new Error(`wrangler deploy failed: ${tail(r)}`);
  const urls = parseDeployUrls(r.stdout + "\n" + r.stderr);
  if (!urls.deployment && !urls.alias) throw new Error(`wrangler deploy printed no URL: ${tail(r)}`);
  return urls;
}

export async function deployDraft(slug: string, itemId: string, dir: string, o: PagesOptions): Promise<{ previewUrl: string }> {
  const urls = await deploy(slug, dir, draftBranch(itemId), o);
  return { previewUrl: (urls.alias ?? urls.deployment) as string };
}

export async function promote(slug: string, dir: string, o: PagesOptions): Promise<{ liveUrl: string }> {
  const urls = await deploy(slug, dir, "main", o);
  // The production deploy prints its own hashed URL; the project's address is
  // one label up from it (the project may not be named hm-<slug> on pages.dev
  // if that subdomain was taken, so it is read, not built).
  const liveUrl = liveUrlOf((urls.deployment ?? urls.alias) as string);
  if (!liveUrl) throw new Error("wrangler deploy printed no project URL");
  return { liveUrl };
}

// Static file types only. Anything else is left behind, not refused: an agent
// that saved its notes beside the page has still built a page.
const STATIC = new Set([
  ".html", ".htm", ".css", ".js", ".mjs", ".json", ".txt", ".xml", ".webmanifest",
  ".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico",
  ".woff", ".woff2", ".ttf", ".otf", ".mp4", ".webm", ".mp3", ".pdf",
]);
export const SITE_MAX_BYTES = 50 * 1024 * 1024;

/**
 * Copy the agent's site folder into dest (emptied first). Throws when there is
 * no index.html or the files come to more than maxBytes.
 */
export function snapshotSite(src: string, dest: string, opts: { maxBytes?: number } = {}): { files: number } {
  if (!existsSync(join(src, "index.html")) || !statSync(join(src, "index.html")).isFile()) {
    throw new Error("the site folder has no index.html");
  }
  const max = opts.maxBytes ?? SITE_MAX_BYTES;
  const picked: string[] = [];
  let bytes = 0;
  const walk = (rel: string) => {
    for (const name of readdirSync(join(src, rel))) {
      const r = rel ? join(rel, name) : name;
      if (!rel && (name.startsWith("_") || name === "functions")) continue;
      if (name.startsWith(".")) continue;
      const st = lstatSync(join(src, r));
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) walk(r);
      else if (st.isFile() && STATIC.has(extname(name).toLowerCase())) {
        bytes += st.size;
        if (bytes > max) throw new Error(`the site is too big (over ${Math.round(max / 1024 / 1024)} MB)`);
        picked.push(r);
      }
    }
  };
  walk("");
  rmSync(dest, { recursive: true, force: true });
  for (const r of picked) {
    mkdirSync(join(dest, r, ".."), { recursive: true });
    cpSync(join(src, r), join(dest, r));
  }
  return { files: picked.length };
}
