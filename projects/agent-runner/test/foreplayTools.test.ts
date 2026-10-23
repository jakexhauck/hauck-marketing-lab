import { describe, expect, it } from "vitest";
import { foreplay, foreplayBrands, TURN_CAP } from "../src/foreplayTools.ts";

const ok = (data: unknown, cursor: string | null = null) => ({ metadata: { success: true, cursor }, data });

function api(answer: (url: string) => unknown, status = 200) {
  const calls: { url: string; auth: string }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, auth: String((init?.headers as Record<string, string>)?.Authorization) });
    return new Response(JSON.stringify(answer(url)), { status });
  }) as unknown as typeof fetch;
  return { calls, f };
}

const ad = (n: number) => ({
  name: `Brand ${n}`,
  started_running: Date.UTC(2026, 9, 1),
  running_duration: { days: 21 },
  display_format: "VIDEO",
  live: true,
  cta_type: "LEARN_MORE",
  headline: "Free estimate",
  description: "New windows,   no money down",
  full_transcription: "Tired of drafty windows?",
  link_url: "https://example.com/quote",
  foreplay_url: `https://app.foreplay.co/discovery?ad=a${n}`,
});

describe("foreplay", () => {
  it("finds brands by name with the key as the Authorization header", async () => {
    const { calls, f } = api(() => ok([{ id: "YQQQ3HAuZhzA3Onle5BG", name: "Window Nation", category: "Home Window Service", active_ads_count: 178, ads_count: 19686, url: "https://facebook.com/windownation" }]));
    const out = await foreplayBrands("name", "window nation", { apiKey: "k", fetchImpl: f });
    expect(out).toBe("- Window Nation | Home Window Service | 178 live of 19686 ads | https://facebook.com/windownation | id YQQQ3HAuZhzA3Onle5BG");
    expect(calls[0].url).toMatch(/^https:\/\/public\.api\.foreplay\.co\/api\/discovery\/brands\?query=window\+nation/);
    expect(calls[0].auth).toBe("k");
  });

  it("lists ads with copy, transcript and the next page, live only and 10 by default", async () => {
    const { calls, f } = api(() => ok([ad(1)], "c2"));
    const out = await foreplay({ apiKey: "k", fetchImpl: f })("m1", "search", "window replacement");
    expect(out).toContain("1 ads (1 credits)");
    expect(out).toContain("- Brand 1 | started 2026-10-01, 21 days | VIDEO | live | CTA LEARN_MORE");
    expect(out).toContain("  Text: New windows, no money down");
    expect(out).toContain("  Transcript: Tired of drafty windows?");
    expect(out).toContain("More: pass cursor c2");
    expect(calls[0].url).toContain("limit=10");
    expect(calls[0].url).toContain("live=true");
  });

  it("takes a DCO ad's copy and media from its first card", async () => {
    const dco = { ...ad(2), display_format: "DCO", headline: "", description: null, full_transcription: null, cards: [{ headline: "Get your free quote now!", description: "Extra 10% off", image: "https://r2.foreplay.co/x.jpg" }, { headline: "Other" }] };
    const { f } = api(() => ok([dco]));
    const out = await foreplay({ apiKey: "k", fetchImpl: f })("m1", "brand_ads", "YQQQ3HAuZhzA3Onle5BG");
    expect(out).toContain("| DCO, 2 versions |");
    expect(out).toContain("  Headline: Get your free quote now!\n  Text: Extra 10% off\n  Media: https://r2.foreplay.co/x.jpg");
  });

  it("holds a call to 25 ads and refuses brand ids that are not ids", async () => {
    const { calls, f } = api(() => ok([]));
    const fp = foreplay({ apiKey: "k", fetchImpl: f });
    expect(await fp("m1", "brand_ads", "YQQQ3HAuZhzA3Onle5BG", { limit: 500, order: "longest_running" })).toBe("No ads found (no credits spent).");
    expect(calls[0].url).toContain("limit=25");
    expect(calls[0].url).toContain("order=longest_running");
    await expect(fp("m1", "brand_ads", "../usage")).rejects.toThrow(/brand ids/);
  });

  it("stops a turn at the cap, counted by ads returned, and lets the next turn spend", async () => {
    const { calls, f } = api((url) => ok(Array.from({ length: Number(new URL(url).searchParams.get("limit")) }, (_, i) => ad(i))));
    const fp = foreplay({ apiKey: "k", fetchImpl: f });
    for (let i = 0; i < TURN_CAP / 25; i++) await fp("m1", "search", "windows", { limit: 25 });
    await expect(fp("m1", "search", "windows", { limit: 1 })).rejects.toThrow(`used ${TURN_CAP} of its ${TURN_CAP}`);
    expect(calls).toHaveLength(TURN_CAP / 25);
    expect(await fp("m2", "search", "windows", { limit: 1 })).toContain("1 ads");
  });

  it("reports Foreplay's message and never the key", async () => {
    const { f } = api(() => ({ metadata: { success: false, message: "Invalid API key" } }), 401);
    const err = await foreplay({ apiKey: "secret-key", fetchImpl: f })("m1", "usage", "").catch((e: Error) => e);
    expect((err as Error).message).toBe("Foreplay 401: Invalid API key");
    expect((err as Error).message).not.toContain("secret-key");
  });
});
