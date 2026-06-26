import type { Env, ApiData } from "../../lib/env";

// GET /api/admin/builds  (admin-only, gated in _middleware.ts)
// Thin authenticated GitHub proxy: list vault/Plans/Builds/*.md on the default
// branch and return each file's raw markdown. All parsing happens client-side
// in src/lib/builds.ts so it stays unit-tested. The response is edge-cached
// ~60s to stay well under the authenticated GitHub rate limit when the board
// polls.

const DIR = "vault/Plans/Builds";
const BRANCH = "main";
const CACHE_TTL = 60;

interface TreeEntry {
  path: string;
  type: string;
}

function ghHeaders(token: string, accept: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: accept,
    "User-Agent": "hml-build-lab",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const token = ctx.env.GITHUB_TOKEN;
  if (!token) return Response.json({ error: "github not configured" }, { status: 503 });
  const repo = ctx.env.GITHUB_REPO || "jakexhauck/hauck-marketing-lab";

  // Edge cache lookup (shared data, so a single fixed key is correct).
  const cache = caches.default;
  const cacheKey = new Request(new URL(ctx.request.url).origin + "/__cache/admin/builds");
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  // 1. One recursive tree call, filter to our folder.
  const treeRes = await fetch(
    `https://api.github.com/repos/${repo}/git/trees/${BRANCH}?recursive=1`,
    { headers: ghHeaders(token, "application/vnd.github+json") },
  );
  if (!treeRes.ok) {
    return Response.json({ error: `github tree ${treeRes.status}` }, { status: 502 });
  }
  const tree = (await treeRes.json()) as { tree?: TreeEntry[] };
  const paths = (tree.tree ?? [])
    .filter(
      (e) => e.type === "blob" && e.path.startsWith(`${DIR}/`) && e.path.endsWith(".md"),
    )
    .map((e) => e.path);

  // 2. Fetch raw markdown for each plan (parallel). Raw Accept avoids base64.
  const files = await Promise.all(
    paths.map(async (path) => {
      const res = await fetch(
        `https://api.github.com/repos/${repo}/contents/${path}?ref=${BRANCH}`,
        { headers: ghHeaders(token, "application/vnd.github.raw") },
      );
      if (!res.ok) return null;
      const raw = await res.text();
      const slug = path.slice(DIR.length + 1).replace(/\.md$/i, "");
      return { slug, raw };
    }),
  );

  const body = {
    files: files.filter((f): f is { slug: string; raw: string } => f !== null),
  };
  const out = Response.json(body, {
    headers: { "Cache-Control": `max-age=${CACHE_TTL}` },
  });
  ctx.waitUntil(cache.put(cacheKey, out.clone()));
  return out;
};
