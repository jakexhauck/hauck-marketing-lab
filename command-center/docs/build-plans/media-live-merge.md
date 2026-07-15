# Paid Ads: merge "Your Ads" into "Media" (live-marked)

Status: building. Base: `origin/main` (`56938b4`) in worktree `hml-worktrees/media-merge`, branch `feat/media-live-merge`.

## Frame

Paid Ads currently has two overlapping creative tabs:

- **Your Ads** (`routes/paid-ads/AdsCreatives.tsx`) — live ad creatives as people see them: full creative, ad copy, platform badges, green Live pill, lightbox modal. Filters to active ads only.
- **Media** (`routes/paid-ads/AdsMedia.tsx`) — the raw photo/video library from the ad account: compact square tiles, Photo/Video badge, no live/paused distinction.

They confuse: one shows a subset (live) richly, the other shows everything plainly. Jake wants **one** tab that shows **all** ad media and simply **marks which ones are live**.

Definition of done:

- Single Paid Ads media tab named **Media**, showing every photo and video in the account.
- Each item that backs a currently-running (ACTIVE) ad carries a green **Live** pill; the rest are unmarked.
- The old "Your Ads" tab and its route are gone; the old URL redirects to Media.
- Live-marking is exact (server-side hash / video-id join), never fabricated.
- typecheck + vite build clean; live-verified for Willis.

Decisions (Jake): merged tab name = **Media**; card style = **compact tiles**; content = **all ad media, live marked**; Media moves to the 2nd tab slot (after Overview). Copy/platform detail from the old Your Ads cards is intentionally dropped.

## Architecture

Live status is computed on the **server**, where the raw Meta identifiers exist. The client stays dumb: it renders a `live` boolean the endpoint already resolved. No fuzzy URL matching in the browser.

Join keys (exact):
- video item `id` (= Meta `video_id`) ∈ set of ACTIVE ads' `video_id`s.
- image item `id` (= Meta `image_hash`) ∈ set of ACTIVE ads' `image_hash`es.

Best-effort: if the extra `/ads` call fails, every item degrades to `live: false`. We never invent "live".

## Files & steps

### 1. `command-center/app/functions/lib/adsMedia.ts` (server)
- Add `live: boolean` to `MediaItem`.
- Extract a small helper `creativeImageHashes(creative)` and `creativeVideoId(creative)` that read the same object_story_spec / asset_feed_spec / top-level paths already used by `fetchImageCreatives` (link_data / photo_data / image_hash / asset_feed images; video_data / link_data / video_id / asset_feed videos), so the live-set extraction and the image-list extraction agree on where a hash/video lives.
- New `fetchLiveCreativeKeys(token, account)`: GET `/${account}/ads` with `fields=effective_status,creative{video_id,image_hash,object_story_spec,asset_feed_spec}` limit 200. For rows where `effective_status === "ACTIVE"`, collect video_ids into `liveVideos:Set<string>` and image_hashes into `liveHashes:Set<string>`. Best-effort try/catch → empty sets.
- In `fetchImageCreatives` / `fetchVideos`, set `live` by membership. Simplest: have `buildAdsMedia` fetch the live keys in the same `Promise.all`, then map over the assembled `items` and set `live` (video → liveVideos.has(id); image → liveHashes.has(id)). Keep `fetchImageCreatives`/`fetchVideos` returning `live:false` by default so their own callers (admin cockpit) still compile.
- Sort `items` live-first (`Number(b.live) - Number(a.live)`), videos already before images preserved as tiebreak is not required.

### 2. `command-center/app/src/hooks/useAdsMedia.ts` (client hook)
- Add `live: boolean` to `AdMediaItem`.
- `normalizeAdsMedia`: coerce each item's `live` to `Boolean(item.live)` (default false). Currently items pass through untouched via `r.items`; map them so a missing `live` never renders undefined.

### 3. `command-center/app/src/routes/paid-ads/AdsMedia.tsx` (client route)
- `MediaTile`: when `item.live`, render a green Live pill (top-right), matching the old Your Ads pill (`#16a34a`, dot + "Live"). Non-live tiles unchanged.
- Header: when connected and any live items, show a "N running now" count chip in `PageBar` actions (green, positive-tint), mirroring the old Your Ads chip.
- `DEMO_ITEMS`: add `live` to each; mark ~2 live so the badge reads in demo.
- Update the tab description to reflect the merged purpose (e.g. "Every photo and video in your ad account. The ones running right now are marked Live.").

### 4. `command-center/app/src/lib/pageTabs.ts`
- Remove the `{ to: "/marketing/paid-ads/creatives", label: "Your Ads" }` tab.
- Move `{ to: "/marketing/paid-ads/media", label: "Media" }` to the 2nd slot (after Overview). Final: Overview · Media · Ad Stats.

### 5. `command-center/app/src/App.tsx`
- Replace the `/marketing/paid-ads/creatives` route element with `<Navigate to="/marketing/paid-ads/media" replace />`.
- Remove the `import AdsCreatives from "./routes/paid-ads/AdsCreatives"`.

### 6. Deletions (same commit)
- `git rm command-center/app/src/routes/paid-ads/AdsCreatives.tsx`.
- `git rm command-center/app/src/components/ads/AdCreativeModal.tsx` (orphaned once AdsCreatives is gone; confirm no other importer first).

### 7. Verify
- Junction root `node_modules` into the worktree; `npx tsc --noEmit` + `npx vite build` clean.
- Live: load Paid Ads → Media for Willis; confirm live ads carry the pill, non-live media does not, and `/marketing/paid-ads/creatives` redirects to `/media`.

## Risks
- `nav.test.ts` asserts tab routes exist / don't collide. Dropping the creatives tab is fine (it becomes a redirect, not a sidebar row); update the test if it hard-codes "Your Ads".
- Some image creatives carry only an inline `image_url` and no hash; those can't be hash-matched and will read as not-live. Acceptable (rare; the ad-level creative almost always carries the hash).
