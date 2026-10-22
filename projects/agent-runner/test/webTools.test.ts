import { describe, expect, it } from "vitest";
import { checkUrl, feedToText, isPrivateIp, reach, readPage, safeGet, vttToText } from "../src/webTools.ts";

const publicDns = async () => ["93.184.216.34"];

function fakeFetch(routes: Record<string, { status?: number; type?: string; body?: string; location?: string }>): typeof fetch {
  return (async (input: string | URL) => {
    const r = routes[input.toString()];
    if (!r) return new Response("missing", { status: 404 });
    const headers: Record<string, string> = { "content-type": r.type ?? "text/html" };
    if (r.location) headers.location = r.location;
    return new Response(r.body ?? "", { status: r.status ?? 200, headers });
  }) as typeof fetch;
}

describe("isPrivateIp", () => {
  it("refuses inside addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.18.0.5", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });
  it("lets the public internet through", () => {
    for (const ip of ["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700::1111"]) expect(isPrivateIp(ip), ip).toBe(false);
  });
});

describe("checkUrl", () => {
  it("refuses a name that resolves inside, like Hermes on the Docker network", async () => {
    await expect(checkUrl("http://hermes-agent:8642/p/ads/api/sessions", async () => ["172.18.0.3"])).rejects.toThrow(/not on the public internet/);
  });
  it("refuses other schemes and logins", async () => {
    await expect(checkUrl("file:///etc/passwd", publicDns)).rejects.toThrow(/http and https/);
    await expect(checkUrl("https://a:b@example.com/", publicDns)).rejects.toThrow(/login/);
  });
  it("refuses a bare inside IP without asking DNS", async () => {
    await expect(checkUrl("http://169.254.169.254/latest/meta-data", publicDns)).rejects.toThrow(/public internet/);
  });
});

describe("safeGet", () => {
  it("checks every redirect, so a public page cannot bounce the agent inside", async () => {
    const f = fakeFetch({ "https://example.com/": { status: 302, location: "http://127.0.0.1:8700/mcp" } });
    await expect(safeGet("https://example.com/", { fetchImpl: f, resolve: publicDns })).rejects.toThrow(/public internet/);
  });
  it("follows a public redirect", async () => {
    const f = fakeFetch({
      "https://example.com/a": { status: 301, location: "/b" },
      "https://example.com/b": { body: "hello", type: "text/plain" },
    });
    const r = await safeGet("https://example.com/a", { fetchImpl: f, resolve: publicDns });
    expect(r).toMatchObject({ url: "https://example.com/b", body: "hello" });
  });
});

describe("readPage", () => {
  it("keeps the article and drops the chrome around it", async () => {
    const html = `<!doctype html><html><head><title>Window costs</title></head><body>
      <nav><a href="/">Home</a> <a href="/shop">Shop</a> Subscribe to our newsletter</nav>
      <article><h1>What new windows cost</h1>
      <p>Replacing a double hung window costs between six hundred and twelve hundred dollars installed, depending on the frame.</p>
      <p>Older homes often need the opening squared first, which adds labour.</p></article>
      <footer>Cookie settings. All rights reserved.</footer></body></html>`;
    const f = fakeFetch({ "https://example.com/post": { body: html } });
    const md = await readPage("https://example.com/post", { fetchImpl: f, resolve: publicDns });
    expect(md).toContain("double hung window");
    expect(md).not.toContain("Cookie settings");
  });
  it("returns plain text as it is", async () => {
    const f = fakeFetch({ "https://example.com/x.txt": { body: "just text", type: "text/plain" } });
    expect(await readPage("https://example.com/x.txt", { fetchImpl: f, resolve: publicDns })).toBe("just text");
  });
});

describe("reach", () => {
  it("turns YouTube's rolling auto captions into plain lines", () => {
    const vtt = "WEBVTT\nKind: captions\nLanguage: en\n\n00:00:01.000 --> 00:00:02.000\nhello <c>there</c>\n\n00:00:02.000 --> 00:00:03.000\nhello there\nnew line\n";
    expect(vttToText(vtt)).toBe("hello there\nnew line");
  });
  it("only takes YouTube links for transcripts", async () => {
    await expect(reach("youtube_transcript", "https://example.com/v", { resolve: publicDns })).rejects.toThrow(/youtube/);
  });
  it("lists feed entries", () => {
    const xml = `<rss><channel><item><title><![CDATA[Spring sale]]></title><link>https://x.com/1</link><pubDate>Mon, 20 Oct 2026</pubDate></item></channel></rss>`;
    expect(feedToText(xml)).toBe("- Spring sale | Mon, 20 Oct 2026 | https://x.com/1");
  });
  it("refuses an unknown channel", async () => {
    await expect(reach("reddit", "windows", { resolve: publicDns })).rejects.toThrow(/channel must be one of/);
  });
  it("summarises a GitHub repo", async () => {
    const f = fakeFetch({
      "https://api.github.com/repos/kepano/defuddle": {
        type: "application/json",
        body: JSON.stringify({ full_name: "kepano/defuddle", description: "Clean pages", stargazers_count: 10, pushed_at: "2026-10-01", license: { spdx_id: "MIT" } }),
      },
      "https://raw.githubusercontent.com/kepano/defuddle/HEAD/README.md": { type: "text/plain", body: "# Readme" },
    });
    const out = await reach("github_repo", "https://github.com/kepano/defuddle", { fetchImpl: f, resolve: publicDns });
    expect(out).toContain("kepano/defuddle");
    expect(out).toContain("# Readme");
  });
});
