import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { checkUrl, feedToText, isPrivateIp, pinnedRequest, reach, readPage, safeGet, vttToText, type Requester } from "../src/webTools.ts";

const publicDns = async () => ["93.184.216.34"];

// A stand-in for the pinned request: answers by URL, records the address it
// was told to connect to.
function fakeFetch(routes: Record<string, { status?: number; type?: string; body?: string; location?: string }>, ips: string[] = []): Requester {
  return async (url, ip) => {
    ips.push(ip);
    const r = routes[url.toString()];
    if (!r) return { status: 404, location: null, type: "text/plain", body: "missing" };
    return { status: r.status ?? 200, location: r.location ?? null, type: r.type ?? "text/html", body: r.body ?? "" };
  };
}

describe("isPrivateIp", () => {
  it("refuses inside addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.18.0.5", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "::ffff:7f00:1", "64:ff9b::7f00:1", "2606:4700::1111"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });
  it("lets the public IPv4 internet through and refuses all IPv6", () => {
    for (const ip of ["93.184.216.34", "8.8.8.8", "172.32.0.1"]) expect(isPrivateIp(ip), ip).toBe(false);
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

describe("checkUrl and IPv6", () => {
  it("refuses every IPv6 literal, the mapped and NAT64 forms included", async () => {
    for (const u of ["http://[::ffff:127.0.0.1]/", "http://[::ffff:169.254.169.254]/", "http://[::ffff:ac11:2]:8642/", "http://[64:ff9b::7f00:1]/", "http://[::7f00:1]/", "http://[fec0::1]/"]) {
      await expect(checkUrl(u, publicDns), u).rejects.toThrow(/public internet/);
    }
  });
  it("refuses a name with only IPv6 addresses, and connects to the IPv4 it checked", async () => {
    await expect(checkUrl("https://v6only.example/", async () => ["2606:4700::1111"])).rejects.toThrow(/public internet/);
    const ok = await checkUrl("https://both.example/", async () => ["2606:4700::1111", "93.184.216.34"]);
    expect(ok.ip).toBe("93.184.216.34");
  });
});

describe("pinnedRequest", () => {
  it("connects to the address it was given, whatever the name says", async () => {
    const server = createServer((_req, res) => res.end("pinned")).listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const port = (server.address() as AddressInfo).port;
    try {
      const a = await pinnedRequest(new URL(`http://no-such-host.invalid:${port}/`), "127.0.0.1", {});
      expect(a).toMatchObject({ status: 200, body: "pinned" });
    } finally {
      server.close();
    }
  });
  it("stops reading at 5 MB", async () => {
    const big = Buffer.alloc(1_000_000, 97);
    const server = createServer((_req, res) => {
      for (let i = 0; i < 7; i++) res.write(big);
      res.end();
    }).listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const port = (server.address() as AddressInfo).port;
    try {
      await expect(pinnedRequest(new URL(`http://x.invalid:${port}/`), "127.0.0.1", {})).rejects.toThrow(/over 5 MB/);
    } finally {
      server.close();
    }
  });
});

describe("safeGet", () => {
  it("checks every redirect, so a public page cannot bounce the agent inside", async () => {
    const f = fakeFetch({ "https://example.com/": { status: 302, location: "http://127.0.0.1:8700/mcp" } });
    await expect(safeGet("https://example.com/", { request: f, resolve: publicDns })).rejects.toThrow(/public internet/);
  });
  it("follows a public redirect", async () => {
    const f = fakeFetch({
      "https://example.com/a": { status: 301, location: "/b" },
      "https://example.com/b": { body: "hello", type: "text/plain" },
    });
    const ips: string[] = [];
    const r = await safeGet("https://example.com/a", { request: fakeFetch({
      "https://example.com/a": { status: 301, location: "/b" },
      "https://example.com/b": { body: "hello", type: "text/plain" },
    }, ips), resolve: publicDns });
    expect(r).toMatchObject({ url: "https://example.com/b", body: "hello" });
    expect(ips).toEqual(["93.184.216.34", "93.184.216.34"]);
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
    const md = await readPage("https://example.com/post", { request: f, resolve: publicDns });
    expect(md).toContain("double hung window");
    expect(md).not.toContain("Cookie settings");
  });
  it("returns plain text as it is", async () => {
    const f = fakeFetch({ "https://example.com/x.txt": { body: "just text", type: "text/plain" } });
    expect(await readPage("https://example.com/x.txt", { request: f, resolve: publicDns })).toBe("just text");
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
    const out = await reach("github_repo", "https://github.com/kepano/defuddle", { request: f, resolve: publicDns });
    expect(out).toContain("kepano/defuddle");
    expect(out).toContain("# Readme");
  });
});
