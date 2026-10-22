// Reading the web for the Hermes agents (docs/build-plans/hermes-agent-ops.md,
// Phase 1). A profile has no shell, so the skills from the video that run a
// program (Defuddle, Agent Reach) run here, in the runner, and reach the
// agents as bridge tools (mcpBridge.ts).
//
// read_page: Defuddle turns a page into clean Markdown, so an agent pays for
// the article and not the menus, cookie banners and footers around it.
//
// reach: the Agent Reach channels that need no login. YouTube transcripts,
// GitHub and RSS. Reddit and X need accounts and wait for Jake's burner ones.
//
// Every fetch here is aimed by a model, so it is treated as untrusted: http(s)
// only, public IPv4 only, every host (and every redirect's host) resolved and
// refused when it points inside (loopback, the Docker network, link-local
// metadata), and the connection made to the very address that was checked.
// Without that, "read http://hermes-agent:8642/..." would read Hermes's own API.

import { execFile } from "node:child_process";
import http from "node:http";
import https from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const MAX_PAGE = 200_000;
const MAX_BODY = 5_000_000;
const TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 5;

// The only addresses read are public IPv4. Every IPv6 address is refused: its
// literal forms (mapped, compatible, NAT64, hex) are too many to fence one by
// one, and a name with an IPv4 address is still read over that.
export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) !== 4) return true;
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export type Resolve = (host: string) => Promise<string[]>;

const dnsResolve: Resolve = async (host) => (await lookup(host, { all: true })).map((a) => a.address);

// Throws unless the URL is http(s) to a host with public IPv4 addresses only.
// Returns the address to connect to, so the request goes to exactly the one
// checked here and a second DNS answer (rebinding) never gets a say.
export async function checkUrl(raw: string, resolve: Resolve = dnsResolve): Promise<{ url: URL; ip: string }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("only http and https URLs can be read");
  if (url.username || url.password) throw new Error("URLs with a login in them are not read");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) === 6) throw new Error(`${host} is not on the public internet`);
  const found = isIP(host) ? [host] : await resolve(host).catch(() => []);
  const v4 = found.filter((ip) => isIP(ip) === 4);
  if (!found.length) throw new Error(`could not find ${host}`);
  if (!v4.length || v4.some(isPrivateIp)) throw new Error(`${host} is not on the public internet`);
  return { url, ip: v4[0] };
}

export interface Answer {
  status: number;
  location: string | null;
  type: string;
  body: string;
}

// One GET to url, connected to ip whatever DNS would say now, reading at most
// MAX_BODY bytes before it gives up (a huge file never sits in memory).
export type Requester = (url: URL, ip: string, headers: Record<string, string>) => Promise<Answer>;

export const pinnedRequest: Requester = (url, ip, headers) =>
  new Promise((ok, fail) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      url,
      {
        method: "GET",
        headers,
        lookup: (_host, opts, cb) => ((opts as { all?: boolean }).all ? (cb as any)(null, [{ address: ip, family: 4 }]) : (cb as any)(null, ip, 4)),
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return ok({ status, location: typeof res.headers.location === "string" ? res.headers.location : null, type: "", body: "" });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > MAX_BODY) req.destroy(new Error("page is over 5 MB; not read"));
          else chunks.push(c);
        });
        res.on("end", () => ok({ status, location: null, type: String(res.headers["content-type"] ?? ""), body: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", fail);
      },
    );
    const timer = setTimeout(() => req.destroy(new Error("timed out")), TIMEOUT_MS);
    req.on("close", () => clearTimeout(timer));
    req.on("error", fail);
    req.end();
  });

export interface FetchDeps {
  request?: Requester;
  resolve?: Resolve;
}

// GET with every redirect checked like the first URL. Returns the final URL
// and the body as text, capped.
export async function safeGet(raw: string, d: FetchDeps = {}, accept = "text/html,application/xhtml+xml,*/*;q=0.8"): Promise<{ url: string; type: string; body: string }> {
  const request = d.request ?? pinnedRequest;
  let at = await checkUrl(raw, d.resolve);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await request(at.url, at.ip, { accept, "user-agent": "Mozilla/5.0 (compatible; HauckAgent/1.0)" });
    if (res.status >= 300 && res.status < 400) {
      if (!res.location) throw new Error(`redirect with no location from ${at.url.host}`);
      at = await checkUrl(new URL(res.location, at.url).toString(), d.resolve);
      continue;
    }
    if (res.status < 200 || res.status >= 300) throw new Error(`${at.url.host} answered ${res.status}`);
    return { url: at.url.toString(), type: res.type, body: res.body };
  }
  throw new Error("too many redirects");
}

const cap = (s: string) => (s.length > MAX_PAGE ? `${s.slice(0, MAX_PAGE)}\n\n[cut at ${MAX_PAGE} characters]` : s);

// A page as clean Markdown with its title on top. Plain text and JSON come
// back as they are.
export async function readPage(raw: string, d: FetchDeps = {}): Promise<string> {
  const page = await safeGet(raw, d);
  if (!/html|xml/i.test(page.type) && !/^\s*</.test(page.body)) return cap(page.body);
  const { parseHTML } = await import("linkedom");
  const { Defuddle } = await import("defuddle/node");
  const { document } = parseHTML(page.body);
  const out = await Defuddle(document as unknown as Document, page.url, { markdown: true });
  const head = [out.title && `# ${out.title}`, [out.author, out.published, out.domain].filter(Boolean).join(" | ")].filter(Boolean).join("\n");
  return cap(`${head}\n\n${out.content ?? ""}`.trim());
}

// --- reach -----------------------------------------------------------------

export const REACH_CHANNELS = ["youtube_transcript", "github_repo", "github_search", "rss"] as const;
export type ReachChannel = (typeof REACH_CHANNELS)[number];

export interface ReachDeps extends FetchDeps {
  // yt-dlp, run with these args, resolving when it exits. A seam for tests.
  ytdlp?: (args: string[]) => Promise<void>;
}

const runYtdlp = (args: string[]) =>
  new Promise<void>((ok, fail) =>
    execFile("yt-dlp", args, { timeout: 60_000, windowsHide: true }, (e) => (e ? fail(new Error(`yt-dlp: ${e.message.split("\n")[0]}`)) : ok())),
  );

// WebVTT to plain lines, dropping timing rows and the rolling repeats YouTube's
// auto captions carry (each cue repeats the line before it).
export function vttToText(vtt: string): string {
  const lines: string[] = [];
  for (const raw of vtt.split(/\r?\n/)) {
    const line = raw.replace(/<[^>]+>/g, "").trim();
    if (!line || line === "WEBVTT" || line.includes("-->") || /^(Kind|Language|NOTE)\b/.test(line) || /^\d+$/.test(line)) continue;
    if (lines[lines.length - 1] !== line) lines.push(line);
  }
  return lines.join("\n");
}

async function youtubeTranscript(url: string, d: ReachDeps): Promise<string> {
  const { url: u } = await checkUrl(url, d.resolve);
  if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(u.hostname)) throw new Error("youtube_transcript takes a youtube.com or youtu.be link");
  const dir = mkdtempSync(join(tmpdir(), "yt-"));
  try {
    await (d.ytdlp ?? runYtdlp)([
      "--skip-download",
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs",
      "en.*,en",
      "--sub-format",
      "vtt",
      "--no-playlist",
      "-o",
      join(dir, "v.%(ext)s"),
      u.toString(),
    ]);
    const vtt = readdirSync(dir).find((n) => n.endsWith(".vtt"));
    if (!vtt) return "This video has no English captions.";
    return cap(vttToText(readFileSync(join(dir, vtt), "utf8")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function githubJson(path: string, d: ReachDeps): Promise<any> {
  const page = await safeGet(`https://api.github.com/${path}`, d, "application/vnd.github+json");
  return JSON.parse(page.body);
}

async function githubRepo(target: string, d: ReachDeps): Promise<string> {
  const m = target.match(/^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+)/);
  if (!m) throw new Error("github_repo takes owner/repo or a github.com link");
  const [owner, repo] = [m[1], m[2].replace(/\.git$/, "")];
  const info = await githubJson(`repos/${owner}/${repo}`, d);
  let readme = "";
  try {
    readme = (await safeGet(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/README.md`, d, "text/plain")).body;
  } catch {
    readme = "(no README.md)";
  }
  const head = `# ${info.full_name}\n${info.description ?? ""}\nStars ${info.stargazers_count}, last push ${info.pushed_at}, license ${info.license?.spdx_id ?? "none"}`;
  return cap(`${head}\n\n${readme}`);
}

async function githubSearch(query: string, d: ReachDeps): Promise<string> {
  const r = await githubJson(`search/repositories?q=${encodeURIComponent(query)}&per_page=10`, d);
  const rows = (r.items ?? []).map((i: any) => `- ${i.full_name} (${i.stargazers_count} stars): ${i.description ?? ""} ${i.html_url}`);
  return rows.join("\n") || "No repositories found.";
}

// RSS and Atom: title, link and date per entry, newest first as the feed has
// them. Tag soup is fine here; a feed is small and flat.
export function feedToText(xml: string): string {
  const pick = (block: string, tag: string) => block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"))?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim() ?? "";
  const link = (block: string) => pick(block, "link") || block.match(/<link[^>]*href="([^"]+)"/i)?.[1] || "";
  const entries = xml.match(/<(item|entry)[\s>][\s\S]*?<\/(item|entry)>/gi) ?? [];
  return entries
    .slice(0, 30)
    .map((e) => `- ${pick(e, "title")} | ${pick(e, "pubDate") || pick(e, "updated") || pick(e, "published")} | ${link(e)}`)
    .join("\n") || "No entries in this feed.";
}

export async function reach(channel: string, target: string, d: ReachDeps = {}): Promise<string> {
  const t = target.trim();
  if (!t) throw new Error("target is required");
  switch (channel) {
    case "youtube_transcript":
      return youtubeTranscript(t, d);
    case "github_repo":
      return githubRepo(t, d);
    case "github_search":
      return githubSearch(t, d);
    case "rss":
      return feedToText((await safeGet(t, d, "application/rss+xml,application/atom+xml,text/xml,*/*")).body);
    default:
      throw new Error(`channel must be one of: ${REACH_CHANNELS.join(", ")}`);
  }
}
