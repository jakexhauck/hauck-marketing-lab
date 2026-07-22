# Your Ads Creatives Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the client-facing "Your Ads" tab show each ad's real creative properly, uncropped, with video ads finally rendering (crisp poster) and playing inline.

**Architecture:** The tab (`AdsCreatives.tsx`) reads `/api/ads/insights`, whose `buildAds` only understands image (`link_data`) creatives, so video ads collapse to a tiny blurry `thumbnail_url` with no copy and no playback. We teach `buildAds` to also parse video (`video_data`) creatives (crisp poster, real copy, `videoId`, `mediaType`). We add one read-only endpoint that resolves a video's playable mp4 `source` server-side with the shared System-User token (never exposing the token, matching the existing token-leak note in `AdPreviewModal`). The gallery is reworked to show the whole creative (contain-fit over a blurred backdrop) at a uniform size, drop the wall of copy, badge videos, and open a simple lightbox that plays the video. The old placement-mockup modal is retired.

**Tech Stack:** React + TypeScript, React Query, Tailwind + design-kit classes, Vitest. Backend: Cloudflare Pages Functions reading Meta Graph API v21.0.

## Global Constraints

- **Never use em dashes** in any output: code, comments, UI copy, docs. Use commas, periods, parentheses, or colons.
- **Client app never names vendors.** No "Meta", "Facebook Graph", "GHL" in client-facing UI copy. "Instagram" and "Facebook" as platforms are fine (that is where the ads run).
- **Honest empty / error states. No fabricated media.** An ad with no resolvable creative shows a neutral placeholder, never a fake image. A video whose source will not resolve falls back to its poster plus a "Watch on Facebook" link, never a broken player.
- **Never leak `META_SYSTEM_USER_TOKEN` to the client.** The video endpoint fetches the mp4 `source` server-side and returns only the URL.
- **Read-only.** Every surface here is a viewer. No writes to Meta.
- **Test command:** `npm run test` (from `command-center/app`, runs `vitest run`). Typecheck: `npm run typecheck`.

---

## File Structure

**Backend:**
- Modify `command-center/app/functions/api/ads/insights.ts`: extend the `/ads` creative field list to pull `object_story_spec{...,video_data{...}}`; rewrite `buildAds` to parse video creatives; add `mediaType` + `videoId` to its `AdItem`; **export `buildAds`** for the test.
- Create `command-center/app/functions/api/ads/video/[videoId].ts`: GET resolves a video's playable mp4 `source` + `permalink_url`.
- Test `command-center/app/functions/api/ads/insights.test.ts`: `buildAds` parses an image creative and a video creative correctly.

**Frontend:**
- Modify `command-center/app/src/lib/adsInsights.ts`: add `mediaType: "image" | "video"` and `videoId?: string` to `AdItem`; default demo ads to `mediaType: "image"`.
- Create `command-center/app/src/hooks/useAdVideo.ts`: `useAdVideoSource(videoId?: string)` React Query hook.
- Create `command-center/app/src/components/ads/AdCreativeModal.tsx`: lightbox showing the full creative; plays video via the source hook, with poster + link fallback.
- Modify `command-center/app/src/routes/paid-ads/AdsCreatives.tsx`: full-creative uniform cards, no copy wall, video play glyph, open `AdCreativeModal`.
- Delete `command-center/app/src/components/ads/AdPreviewModal.tsx` (placement mockups retired; only `AdsCreatives` imports it).

---

## Task 1: Parse video creatives in `buildAds`

**Files:**
- Modify: `command-center/app/functions/api/ads/insights.ts`
- Test: `command-center/app/functions/api/ads/insights.test.ts`

**Interfaces:**
- Produces: `AdItem` gains `mediaType: "image" | "video"` and `videoId: string` (`""` for image ads). `thumbnailUrl` now prefers, for video ads, `object_story_spec.video_data.image_url`. `copy` now also falls back to `video_data.message`; `headline` also falls back to `video_data.title` / `video_data.link_description`. `buildAds(insights, meta)` is exported.

- [ ] **Step 1: Write the failing test.** Create `insights.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildAds } from "./insights";

describe("buildAds", () => {
  it("parses an image (link_data) creative", () => {
    const meta = [{
      id: "1",
      name: "Ad One",
      effective_status: "ACTIVE",
      creative: {
        title: "Same-day service",
        body: "Book in 60 seconds.",
        image_url: "https://img/full.jpg",
        thumbnail_url: "https://img/tiny.jpg",
        object_story_spec: { link_data: { name: "ignored", message: "ignored", picture: "https://img/link.jpg" } },
      },
    }];
    const [ad] = buildAds([{ ad_id: "1", spend: "10", reach: "100", actions: [] }], meta);
    expect(ad.mediaType).toBe("image");
    expect(ad.videoId).toBe("");
    expect(ad.thumbnailUrl).toBe("https://img/full.jpg");
    expect(ad.headline).toBe("Same-day service");
    expect(ad.copy).toBe("Book in 60 seconds.");
  });

  it("parses a video (video_data) creative: crisp poster, real copy, videoId", () => {
    const meta = [{
      id: "2",
      name: "Video 2 | $100 OFF",
      effective_status: "ACTIVE",
      creative: {
        title: "",
        body: "",
        thumbnail_url: "https://img/blurry-tiny.jpg",
        object_story_spec: {
          video_data: {
            video_id: "vid_999",
            image_url: "https://img/crisp-poster.jpg",
            title: "Watch how we clean",
            message: "METRO DETROIT HOMEOWNERS, $100 off your first clean.",
          },
        },
      },
    }];
    const [ad] = buildAds([{ ad_id: "2", spend: "20", reach: "200", actions: [] }], meta);
    expect(ad.mediaType).toBe("video");
    expect(ad.videoId).toBe("vid_999");
    expect(ad.thumbnailUrl).toBe("https://img/crisp-poster.jpg");
    expect(ad.copy).toBe("METRO DETROIT HOMEOWNERS, $100 off your first clean.");
    expect(ad.headline).toBe("Watch how we clean");
  });
});
```

- [ ] **Step 2: Run test, confirm FAIL.** Run: `npm run test -- insights`. Expected: FAIL (`buildAds` not exported / `mediaType` undefined).

- [ ] **Step 3: Extend the creative field query.** In `insights.ts`, in the `Promise.all` block, change the `/ads` call fields to include video data:

```ts
graphGet(token, `/${account}/ads`, { fields: "id,name,effective_status,creative{title,body,image_url,thumbnail_url,object_story_spec}", limit: "200" }),
```

(`object_story_spec` returns both `link_data` and `video_data` sub-objects; no need to enumerate their fields in the query.)

- [ ] **Step 4: Rewrite `buildAds` to parse both creative kinds and export it.** Replace the current `buildAds` body's per-ad shaping with:

```ts
export function buildAds(
  insights: Record<string, unknown>[],
  meta: Record<string, unknown>[],
): AdItem[] {
  const byId = new Map<string, Record<string, unknown>>();
  for (const row of insights) {
    const id = String(row.ad_id ?? "");
    if (id) byId.set(id, row);
  }
  const ads: AdItem[] = [];
  for (const m of meta) {
    const id = String(m.id ?? "");
    if (!id) continue;
    const ins = byId.get(id) ?? {};
    const creative = (m.creative ?? {}) as Record<string, unknown>;
    const story = (creative.object_story_spec ?? {}) as Record<string, unknown>;
    const linkData = (story.link_data ?? {}) as Record<string, unknown>;
    const videoData = (story.video_data ?? {}) as Record<string, unknown>;
    const videoId = String(videoData.video_id ?? "");
    const mediaType: "image" | "video" = videoId ? "video" : "image";
    const headline =
      String(creative.title ?? "") ||
      String(videoData.title ?? "") ||
      String(videoData.link_description ?? "") ||
      String(linkData.name ?? "") ||
      String(m.name ?? "") ||
      "Ad";
    const copy =
      String(creative.body ?? "") ||
      String(videoData.message ?? "") ||
      String(linkData.message ?? "") ||
      "";
    // Crisp creative first. Video ads carry a full-res poster in
    // video_data.image_url; the creative-level thumbnail_url is a tiny blurry
    // auto-thumb, so it is the LAST resort. Image ads use image_url.
    const thumbnailUrl =
      String(creative.image_url ?? "") ||
      String(videoData.image_url ?? "") ||
      String(linkData.picture ?? "") ||
      String(creative.thumbnail_url ?? "");
    const status = String(m.effective_status ?? "");
    ads.push({
      id,
      headline,
      copy,
      platforms: ["fb", "ig"],
      active: status === "ACTIVE",
      leads: Math.round(actionsValue(ins, "actions")),
      reach: Math.round(num(ins.reach)),
      spend: round2(num(ins.spend)),
      thumbnailUrl,
      mediaType,
      videoId,
    });
  }
  return ads.sort(
    (a, b) => Number(b.active) - Number(a.active) || b.leads - a.leads,
  );
}
```

Then add the two fields to the local `AdItem` interface in this file:

```ts
  thumbnailUrl: string;
  // "image" or "video". Video ads carry a playable videoId; image ads leave it "".
  mediaType: "image" | "video";
  videoId: string;
```

- [ ] **Step 5: Run test, confirm PASS.** Run: `npm run test -- insights`. Expected: PASS (both cases).

- [ ] **Step 6: Typecheck.** Run: `npm run typecheck`. Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add command-center/app/functions/api/ads/insights.ts command-center/app/functions/api/ads/insights.test.ts
git commit -m "fix(paid-ads): parse video creatives in buildAds (crisp poster, real copy, videoId)"
```

## Task 2: Video source endpoint

**Files:**
- Create: `command-center/app/functions/api/ads/video/[videoId].ts`

**Interfaces:**
- Produces: `GET /api/ads/video/:videoId` returns `{ source: string; permalink: string }`. `source` is the playable mp4 URL (`""` if Meta will not resolve it); `permalink` is the public Facebook watch URL (`""` if none). Never fabricated, never exposes the token.

- [ ] **Step 1: Write the endpoint.**

```ts
import { type Env, type ApiData } from "../../../lib/env";

// Read-only: resolve a single ad video's playable mp4 source + public permalink
// so the client's Your Ads lightbox can play the real video. The System-User
// token is used server-side ONLY; the client receives just the resolved URLs,
// never the token (same reason AdPreviewModal never embedded Meta's iframe).
// Honest by design: if Meta will not return a source, `source` is "" and the
// client falls back to the poster plus the Facebook watch link.

const GRAPH = "https://graph.facebook.com/v21.0";

export interface AdVideoResponse {
  source: string;
  permalink: string;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const token = ctx.env.META_SYSTEM_USER_TOKEN;
  const videoId = String(ctx.params.videoId ?? "");
  if (!token || !videoId) {
    return Response.json({ source: "", permalink: "" } satisfies AdVideoResponse);
  }
  try {
    const url = new URL(`${GRAPH}/${videoId}`);
    url.searchParams.set("fields", "source,permalink_url");
    url.searchParams.set("access_token", token);
    const res = await fetch(url.toString());
    if (!res.ok) {
      return Response.json({ source: "", permalink: "" } satisfies AdVideoResponse);
    }
    const data = (await res.json()) as { source?: string; permalink_url?: string };
    return Response.json({
      source: typeof data.source === "string" ? data.source : "",
      permalink: typeof data.permalink_url === "string" ? data.permalink_url : "",
    } satisfies AdVideoResponse);
  } catch {
    return Response.json({ source: "", permalink: "" } satisfies AdVideoResponse);
  }
};
```

(Confirm import depth: from `functions/api/ads/video/[videoId].ts` to `functions/lib/env` is `../../../lib/env`.)

- [ ] **Step 2: Typecheck.** Run: `npm run typecheck`. Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add command-center/app/functions/api/ads/video/
git commit -m "feat(paid-ads): read-only endpoint resolving an ad video's playable source"
```

## Task 3: Client `AdItem` type + video source hook

**Files:**
- Modify: `command-center/app/src/lib/adsInsights.ts`
- Create: `command-center/app/src/hooks/useAdVideo.ts`

**Interfaces:**
- Consumes: `AdVideoResponse` shape from Task 2 (`{ source, permalink }`).
- Produces: client `AdItem` gains `mediaType: "image" | "video"` and `videoId?: string`. `useAdVideoSource(videoId?: string)` returns a React Query result of `{ source: string; permalink: string }`, enabled only when `videoId` is set.

- [ ] **Step 1: Add fields to the client `AdItem`.** In `adsInsights.ts`, after `thumbnailUrl?: string;`:

```ts
  thumbnailUrl?: string;
  // Mirrors the endpoint: "video" ads carry a videoId the lightbox can play.
  mediaType?: "image" | "video";
  videoId?: string;
```

- [ ] **Step 2: Default demo ads to image.** In `demoAdsInsights()`, add `mediaType: "image" as const` to the mapped ad object (demo has no real video):

```ts
    active: a.active,
    leads: a.leads,
    reach: a.reach,
    spend: Math.round(a.leads * 58),
    mediaType: "image" as const,
```

- [ ] **Step 3: Create the hook.**

```ts
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

// Resolves a single ad video's playable source on demand (only when the
// lightbox opens a video). Returns { source, permalink }; source "" means the
// player falls back to the poster + Facebook watch link.
export interface AdVideoSource {
  source: string;
  permalink: string;
}

export function useAdVideoSource(videoId?: string) {
  return useQuery({
    queryKey: ["ads", "video", videoId],
    enabled: Boolean(videoId),
    staleTime: 5 * 60_000,
    queryFn: () => api<AdVideoSource>(`/api/ads/video/${videoId}`),
  });
}
```

- [ ] **Step 4: Typecheck.** Run: `npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add command-center/app/src/lib/adsInsights.ts command-center/app/src/hooks/useAdVideo.ts
git commit -m "feat(paid-ads): client AdItem mediaType/videoId + video source hook"
```

## Task 4: `AdCreativeModal` lightbox

**Files:**
- Create: `command-center/app/src/components/ads/AdCreativeModal.tsx`

**Interfaces:**
- Consumes: `AdItem` (`adsInsights.ts`), `useAdVideoSource` (Task 3), `PlatformGlyph` (`shared.tsx`).
- Produces: `default export AdCreativeModal({ ad, onClose }: { ad: AdItem | null; onClose: () => void })`. Shows the full creative large. Video ads: play `<video>` from the resolved source (poster = `ad.thumbnailUrl`); if source is "", show the poster and, when a permalink exists, a "Watch on Facebook" link.

- [ ] **Step 1: Create the component.**

```tsx
import { useEffect } from "react";
import { X, Play } from "lucide-react";
import type { AdItem } from "../../lib/adsInsights";
import { useAdVideoSource } from "../../hooks/useAdVideo";
import { PlatformGlyph } from "../../routes/paid-ads/shared";

// A simple lightbox: show the ad's real creative big. Image ads render the
// image; video ads play the resolved mp4 (poster while it loads). No fabricated
// media: an ad with no creative shows a neutral panel; a video with no
// resolvable source shows its poster plus a Facebook watch link.
export default function AdCreativeModal({ ad, onClose }: { ad: AdItem | null; onClose: () => void }) {
  const isVideo = ad?.mediaType === "video" && Boolean(ad?.videoId);
  const { data: video } = useAdVideoSource(isVideo ? ad?.videoId : undefined);

  useEffect(() => {
    if (!ad) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ad, onClose]);

  if (!ad) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-[var(--shadow-lg)] sm:max-w-xl sm:rounded-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-divider px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-display text-[16px] text-text">{ad.headline}</h2>
            <div className="mt-1 flex items-center gap-1.5">
              {ad.platforms.map((p) => (
                <PlatformGlyph key={p} p={p} size={15} />
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-faint transition-colors hover:text-text"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {/* The creative, full and uncropped, on a dark stage. */}
          <div className="flex items-center justify-center bg-slate-950 p-3">
            {isVideo && video?.source ? (
              <video
                src={video.source}
                poster={ad.thumbnailUrl || undefined}
                controls
                autoPlay
                playsInline
                className="max-h-[70vh] w-auto max-w-full rounded-lg"
              />
            ) : ad.thumbnailUrl ? (
              <img
                src={ad.thumbnailUrl}
                alt={ad.headline}
                className="max-h-[70vh] w-auto max-w-full rounded-lg object-contain"
              />
            ) : (
              <div className="flex aspect-[4/5] w-full max-w-sm items-center justify-center rounded-lg bg-surface-2 text-faint">
                No preview available
              </div>
            )}
          </div>

          {isVideo && !video?.source && video?.permalink && (
            <a
              href={video.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="mx-5 mb-4 mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[13px] font-semibold text-text transition-colors hover:border-brand/40"
            >
              <Play size={14} /> Watch on Facebook
            </a>
          )}

          {ad.copy && (
            <p className="whitespace-pre-line px-5 pb-5 pt-4 text-[13px] leading-relaxed text-muted">{ad.copy}</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck.** Run: `npm run typecheck`. Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add command-center/app/src/components/ads/AdCreativeModal.tsx
git commit -m "feat(paid-ads): AdCreativeModal lightbox (plays video, shows full creative)"
```

## Task 5: Rework the gallery cards + retire the old modal

**Files:**
- Modify: `command-center/app/src/routes/paid-ads/AdsCreatives.tsx`
- Delete: `command-center/app/src/components/ads/AdPreviewModal.tsx`

**Interfaces:**
- Consumes: `AdCreativeModal` (Task 4).

- [ ] **Step 1: Confirm no other importer of the old modal.** Run: `git grep -n "AdPreviewModal" command-center/app/src`. Expected: only `AdsCreatives.tsx`. If anything else imports it, stop and report.

- [ ] **Step 2: Rework the card grid.** In `AdsCreatives.tsx`, swap the import `AdPreviewModal` -> `AdCreativeModal`, and replace the card body (the `ads.map(...)` Panel contents) so each card shows the whole creative uncropped over a blurred backdrop, uniform size, a Live tag, a video play glyph when `ad.mediaType === "video"`, the platform icons, and the headline. No copy wall on the card. Full new file below:

```tsx
import { useState } from "react";
import { Megaphone, Play } from "lucide-react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import { Panel, EmptyState } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useAdsInsights } from "../../hooks/useAdsInsights";
import { emptyAdsInsights, type AdItem } from "../../lib/adsInsights";
import { PAID_ADS_TABS } from "../../lib/pageTabs";
import { PAID_ADS_CONTAINER, NotConnectedNotice, PlatformGlyph } from "./shared";
import AdCreativeModal from "../../components/ads/AdCreativeModal";

// "Your Ads": the creatives gallery. Every live ad shown as the real creative,
// uncropped, exactly what people see on Instagram and Facebook. Video ads show a
// crisp poster with a play badge and play in the lightbox on click. Driven by
// real Meta ads (/api/ads/insights); demo shows the sample gallery.

// Deterministic gradient placeholder for the rare ad with no resolvable creative
// (keeps the card intentional rather than blank).
const THUMBS = [
  "linear-gradient(135deg,#4f46e5,#7c73f0 60%,#db2777)",
  "linear-gradient(135deg,#0ea5e9,#4f46e5)",
  "linear-gradient(135deg,#0f172a,#334155 70%,#0ea5e9)",
  "linear-gradient(135deg,#f59e0b,#db2777)",
  "linear-gradient(135deg,#16a34a,#0ea5e9)",
];
function thumbFor(i: number): string {
  return THUMBS[i % THUMBS.length];
}

export default function AdsCreatives() {
  const { session } = useAuth();
  const { data } = useAdsInsights(Boolean(session));
  const insights = data ?? emptyAdsInsights(false);
  // Only the ads running right now belong in "Your Ads"; paused/finished ones
  // are hidden so the client sees exactly what is live for them today.
  const ads = insights.ads.filter((a) => a.active);
  const [preview, setPreview] = useState<AdItem | null>(null);

  return (
    <Shell>
      <div className={PAID_ADS_CONTAINER}>
        <PageBar
          tabs={PAID_ADS_TABS}
          description="Every ad we are running for you right now, exactly as people see it on Instagram and Facebook."
          actions={
            ads.length > 0 ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-positive-tint px-3 py-1.5 text-[12.5px] font-semibold text-positive">
                <span className="h-1.5 w-1.5 rounded-full bg-positive" />
                {ads.length} {ads.length === 1 ? "ad" : "ads"} running now
              </span>
            ) : undefined
          }
        />

        {!insights.configured && (
          <NotConnectedNotice message="Once your Meta ad account is connected, every ad we run for you shows up here exactly as people see it." />
        )}

        {ads.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ads.map((ad, i) => {
              const isVideo = ad.mediaType === "video";
              return (
                <Panel
                  key={ad.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open "${ad.headline}"`}
                  onClick={() => setPreview(ad)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setPreview(ad);
                    }
                  }}
                  className="group flex cursor-pointer flex-col overflow-hidden p-0 transition-colors hover:border-brand/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                >
                  {/* The whole creative, uncropped. A blurred cover of the same
                      image fills the frame behind a contain-fit copy, so any
                      aspect ratio (portrait video, square, landscape) reads
                      cleanly with nothing sliced off. */}
                  <div className="relative aspect-[4/5] w-full overflow-hidden bg-slate-900">
                    {ad.thumbnailUrl ? (
                      <>
                        <div
                          aria-hidden
                          className="absolute inset-0 scale-110 blur-xl"
                          style={{
                            backgroundImage: `url("${ad.thumbnailUrl}")`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                          }}
                        />
                        <div className="absolute inset-0 bg-slate-950/30" />
                        <img
                          src={ad.thumbnailUrl}
                          alt={ad.headline}
                          loading="lazy"
                          className="absolute inset-0 h-full w-full object-contain"
                        />
                      </>
                    ) : (
                      <div className="absolute inset-0" style={{ backgroundImage: thumbFor(i) }} />
                    )}

                    {/* Live tag */}
                    <span
                      className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold text-white"
                      style={{ backgroundColor: "#16a34a", boxShadow: "0 4px 10px rgba(22,163,74,.35)" }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      Live
                    </span>

                    {/* Video play affordance */}
                    {isVideo && (
                      <span className="absolute inset-0 z-10 flex items-center justify-center">
                        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-transform group-hover:scale-105">
                          <Play size={24} className="ml-0.5 fill-current" />
                        </span>
                      </span>
                    )}
                  </div>

                  {/* Footer: headline + platforms. No wall of copy. */}
                  <div className="flex items-center justify-between gap-3 p-3.5">
                    <div className="min-w-0 font-display text-[14px] font-semibold tracking-tight text-text">
                      <span className="line-clamp-1">{ad.headline}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {ad.platforms.map((p) => (
                        <PlatformGlyph key={p} p={p} size={18} />
                      ))}
                    </div>
                  </div>
                </Panel>
              );
            })}
          </div>
        ) : (
          <Panel className="px-4 py-12">
            <EmptyState
              icon={<Megaphone size={22} />}
              title={insights.configured ? "No ads running yet" : "No ads to show yet"}
              description={
                insights.configured
                  ? "Every ad we run for you appears here, exactly as people see it."
                  : "After your accounts are linked, every ad we run for you appears here, exactly as people see it."
              }
            />
          </Panel>
        )}

        <AdCreativeModal ad={preview} onClose={() => setPreview(null)} />
      </div>
    </Shell>
  );
}
```

- [ ] **Step 3: Delete the retired modal.** Run: `git rm command-center/app/src/components/ads/AdPreviewModal.tsx`.

- [ ] **Step 4: Typecheck + test.** Run: `npm run typecheck && npm run test`. Expected: PASS, no unused-import or missing-module errors.

- [ ] **Step 5: Commit.**

```bash
git add command-center/app/src/routes/paid-ads/AdsCreatives.tsx
git commit -m "feat(paid-ads): Your Ads shows full uncropped creatives, video posters + play"
```

## Task 6: Verify + ship

- [ ] **Step 1: Verify live.** Because local dev lacks the Meta secrets, verification is on the real deployment. Full ship per build-loop autopilot: push to `main` (via a worktree off `origin/main` per the standing branch-hygiene pattern, NOT by merging `feat/leads-sales-trash`), watch the Cloudflare deploy, grep the live JS bundle to confirm the new build shipped.
- [ ] **Step 2: Eyeball with Jake.** In Jake's own logged-in browser, open Your Ads: confirm image ads show full and uncropped, the video ad shows a crisp poster with a play badge, and clicking it plays the video (or falls back to the Facebook link honestly). Get sign-off.

---

## Self-Review

- **Spec coverage:** Video parse (Task 1), playable source (Task 2), client type + hook (Task 3), lightbox playback (Task 4), full-creative uniform cards + retire mockups (Task 5), ship + eyeball (Task 6). All of "show the creatives, videos play, drop the mockups" covered.
- **Type consistency:** `mediaType: "image" | "video"` and `videoId` defined in Task 1 (backend `AdItem`, `videoId: string`) and Task 3 (client `AdItem`, `videoId?: string`); `AdVideoResponse { source, permalink }` (Task 2) matches `AdVideoSource` (Task 3) and the modal's usage (Task 4). `buildAds` exported (Task 1) and consumed by the test only.
- **Placeholder scan:** none; every code step is complete.
- **Honest-state check:** no-creative card shows a gradient (not a fake image); no-source video shows poster + Facebook link; not-connected banner unchanged.
