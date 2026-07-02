> ## Run this build (read first)
>
> You are a Claude instance executing this plan autonomously, start to finish.
>
> 1. **DEPENDENCY CHECK FIRST:** this needs the Social AND Campaigns endpoints merged to main. Confirm `functions/api/social/*` and `functions/api/campaigns/*` exist on main. If they do not, STOP and report that you are blocked on those two builds. Do not proceed.
> 2. `git pull origin main`, then create a **git worktree** for this build (invoke the `using-git-worktrees` skill).
> 3. Read this whole doc, especially the **Isolation contract** at the bottom. Only edit the files it says you own. Put any new demo overlay in `src/lib/calendarDemo.ts` (which you own), never in `src/demo/handler.ts`.
> 4. Build to the wiring contract: map the live Social + Campaigns feeds into `CalendarItem`s, merge them into the real branch of `useCalendarItems`, and flip the `connected` flags only when a feed returns rows. Keep the demo branch intact. Never use em dashes anywhere.
> 5. Verify from `command-center/app`: `npm run typecheck`, `npm test` (add a `calendarModel.test.ts` case for the new mappers), `npm run build`, and walk the calendar at `?demo=1`.
> 6. Ship: stage ONLY your files, commit, rebase on main, `git push origin main`, watch the live bundle hash change, then grep the new bundle for a string you shipped. Report what shipped and anything left.

# Calendar: light up the Social + Campaign streams

Spec + plan for wiring the unified Company calendar's `social` and `campaign` overlay streams to
real data. The calendar already merges live appointments and live jobs; social and campaign items
are demo-only today. Client app: `command-center/app`.

## 1. Goal + Definition of Done

**Goal:** in a real session, the Company calendar (`/calendar`) shows scheduled social posts and
scheduled email/SMS campaign sends as their own color-coded streams, alongside the already-live
appointment and job streams. No fabricated content: a stream only appears when its backend returns
rows.

**Definition of Done:**
- Two new pure mappers in `calendarModel.ts`: `socialPostToItem` and `campaignToItem`, each turning
  a feed row into a `CalendarItem` (source `social` / `campaign`).
- `useCalendarItems.ts` real branch merges the social + campaign feeds into `items` alongside
  appointments and jobs.
- `connected.social` and `connected.campaign` flip to `true` only when their feed returns at least
  one row; otherwise stay `false` (chip shows the existing "turns on once connected" hint).
- The demo branch is untouched: `?demo=1` still renders all four streams from `DEMO_SOCIAL` /
  `DEMO_CAMPAIGNS`.
- New `calendarModel.test.ts` covers both mappers (field mapping + all-day handling). `npm run test`
  green; `npm run build` clean.
- `docs/connections/calendar.md` Social + Campaign sections flipped from ❌ to ✅.

## 2. Dependency: Social + Campaigns endpoints (blocking)

This work maps feeds it does not create. It is **blocked** until those feeds land, planned separately:
- **Social:** `docs/build-plans/social-wiring.md`, must expose scheduled social posts (a query hook,
  e.g. `useSocialPostsQuery`, over a `/api/social/posts` Pages Function) returning each post's
  scheduled time, title/caption, and channel(s).
- **Campaigns:** `docs/build-plans/campaigns-sms-wiring.md`, must expose scheduled campaign sends (a
  query hook, e.g. `useCampaignSendsQuery`, over `/api/campaigns/sends`) returning each send's time,
  name, channel (email/SMS), and audience size.

Only the calendar-side mapping and merge is in scope here. If those hooks ship with different names
or shapes, adapt the field reads in the mappers; nothing else changes. Until both exist, the streams
stay `connected: false` exactly as today (no regression).

**Assumed feed row shapes** (confirm against the two plans before building; adjust the mapper field
reads if they differ):

```ts
// from social-wiring
interface ApiSocialPost {
  id: string;
  caption: string;          // post title/body
  channels: string[];       // e.g. ["instagram","facebook"]
  scheduledTime: string | null; // ISO instant, null if unscheduled/draft
  status: string;           // "scheduled" | "published" | ...
}

// from campaigns-sms-wiring
interface ApiCampaignSend {
  id: string;
  name: string;             // campaign name
  channel: "email" | "sms";
  scheduledTime: string | null; // ISO instant
  audienceSize: number | null;
  status: string;           // "scheduled" | "sent" | ...
}
```

## 3. File-by-file steps

### A. `src/lib/calendarModel.ts`, two new mappers

Add after `jobToItem`. Reuse the existing `localParts(iso, tz)` + `minutesToLabel` helpers already in
this file (same pattern as `appointmentToItem`) so timezone handling stays consistent. Import the two
row types from `./api`.

1. **`socialPostToItem(p: ApiSocialPost, tz: string | null): CalendarItem`**
   - `id: "social:" + p.id`
   - `source: "social"`
   - `title: p.caption` (trim/fallback to `"Social post"` if empty)
   - `subtitle:` humanized channel list, e.g. `channelLabel(p.channels)` -> `"Instagram + Facebook"`.
     Add a small local `channelLabel(chs: string[])` helper that title-cases and joins with `" + "`.
   - `date` / `startMinutes:` from `localParts(p.scheduledTime, tz)`.
   - `timeLabel:` `startMinutes == null ? "" : minutesToLabel(startMinutes)`.
   - `endMinutes: null`, `status: p.status`, `amount: null`, `location: ""`, `meetingUrl: ""`,
     `contactId: ""`.
   - Design note: posts are point-in-time; leaving `endMinutes` null lets `packDayColumns` apply the
     default slot. If the design wants posts as all-day chips even when timed, that is a view choice,
     not a mapper change.

2. **`campaignToItem(c: ApiCampaignSend, tz: string | null): CalendarItem`**
   - `id: "campaign:" + c.id`
   - `source: "campaign"`
   - `title: c.name` (fallback `"Campaign"`).
   - `subtitle:` channel + audience, e.g. `c.channel === "sms" ? "SMS" : "Email"` +
     `c.audienceSize != null ? ", " + c.audienceSize.toLocaleString() + " contacts" : ""` ->
     `"Email, 1,240 contacts"`. Matches the demo subtitle style in `calendarDemo.ts`.
   - `date` / `startMinutes` / `timeLabel:` from `localParts(c.scheduledTime, tz)`.
   - `endMinutes: null`, `status: c.status`, `amount: null`, `location: ""`, `meetingUrl: ""`,
     `contactId: ""`.

Keep both mappers pure (no React, no fetch) so they are unit-testable in isolation, matching
`appointmentToItem` / `jobToItem`.

### B. `src/hooks/useCalendarItems.ts`, merge + connected flags

1. Import the two new mappers and the two new query hooks:
   ```ts
   import { appointmentToItem, jobToItem, socialPostToItem, campaignToItem, ... } from "../lib/calendarModel";
   import { useSocialPostsQuery } from "./useSocialPosts";   // from social-wiring
   import { useCampaignSendsQuery } from "./useCampaignSends"; // from campaigns-sms-wiring
   ```
2. Call both queries gated the same way appointments are, so they never fire in demo:
   ```ts
   const social = useSocialPostsQuery(enabled && !demo);
   const campaigns = useCampaignSendsQuery(enabled && !demo);
   ```
3. **Leave the demo branch exactly as-is** (still spreads `DEMO_SOCIAL` + `DEMO_CAMPAIGNS`,
   `connected` all `true`).
4. In the **real branch**, after the existing `appts` / `jobItems`:
   ```ts
   const socialItems = (social.data?.posts ?? [])
     .map((p) => socialPostToItem(p, tz))
     .filter((i) => i.date);          // drop unscheduled/dateless rows
   const campaignItems = (campaigns.data?.sends ?? [])
     .map((c) => campaignToItem(c, tz))
     .filter((i) => i.date);
   ```
   Reuse the same `tz` already derived from `apptQuery.data?.timezone` so all streams share one
   timezone (feeds return UTC ISO; local placement is consistent).
5. Merge into `items`: `[...appts, ...jobItems, ...socialItems, ...campaignItems]`.
6. Connected flags, flip on only when rows land:
   ```ts
   connected: {
     appointment: true,
     job: jobItems.length > 0,
     social: socialItems.length > 0,
     campaign: campaignItems.length > 0,
   },
   ```
7. Fold the two queries' `isLoading` into the aggregate (`apptQuery.isLoading || social.isLoading ||
   campaigns.isLoading`) if their pending state should show the calendar spinner; keep `isError` /
   `error` driven by appointments (social/campaign failures should degrade quietly to "not connected",
   not blank the whole calendar). Add `social.data`, `campaigns.data`, and any loading flags used to
   the `useMemo` dependency array.

### C. `docs/connections/calendar.md`, status

Flip **Social posts** and **Campaign sends** from ❌ to ✅ once wired; update the "Data source" lines
to name the real endpoints/hooks and note that `connected.*` flips automatically on non-empty feed.

## 4. Exact CalendarItem fields per stream

Every view reads only `CalendarItem`, so these five fields carry the render. Full shape in
`calendarModel.ts`.

| Field          | Social (`social`)                              | Campaign (`campaign`)                          |
|----------------|-----------------------------------------------|-----------------------------------------------|
| `date`         | local `YYYY-MM-DD` from `scheduledTime` via `localParts` | local `YYYY-MM-DD` from `scheduledTime` via `localParts` |
| `startMinutes` | minutes past local midnight, or `null` if no scheduled time | minutes past local midnight, or `null`       |
| `timeLabel`    | `minutesToLabel(startMinutes)`, `""` when null | `minutesToLabel(startMinutes)`, `""` when null |
| `title`        | post caption (fallback `"Social post"`)        | campaign name (fallback `"Campaign"`)          |
| `subtitle`     | channel list, e.g. `"Instagram + Facebook"`    | channel + audience, e.g. `"Email, 1,240 contacts"` |

Support fields: `id` = `"<source>:<rawId>"` (unique across streams), `source` set literally,
`status` passed through, `endMinutes: null`, `amount/location/meetingUrl/contactId` empty. Colors come
from the existing `--source-social` / `--source-campaign` tokens in `index.css` via
`CALENDAR_SOURCE_META`; no view or CSS change needed.

## 5. Verification

1. **Unit, new `src/lib/calendarModel.test.ts`** (vitest; `npm run test`). No test file exists in the
   app yet, so this is the first; keep it a plain mapper test (pure functions, no React):
   - `socialPostToItem`: given a row with `scheduledTime` + two channels + a `tz`, assert `id`,
     `source: "social"`, `date`, `startMinutes`, `timeLabel`, `title`, and the `" + "`-joined
     `subtitle`. Second case: `scheduledTime: null` -> `date: ""`, `startMinutes: null`,
     `timeLabel: ""`.
   - `campaignToItem`: assert `source: "campaign"`, subtitle string for an email send with
     `audienceSize` (comma-grouped) and for an SMS send with `audienceSize: null` (no count suffix),
     plus the null-time all-day case.
2. **Demo unchanged:** load `/calendar?demo=1`, confirm all four legend chips show connected and
   Social + Campaign items still render across Month / Week / Agenda (regression check on the demo
   branch).
3. **Real, feed empty:** authed session with the feeds returning `[]` -> Social + Campaign chips read
   "turns on once connected", no items, and appointments/jobs still render (no regression).
4. **Real, feed populated:** with the two backends returning scheduled rows, confirm posts and sends
   appear on their dates/times, colored by source, clickable, and that `connected.social` /
   `connected.campaign` are `true`.
5. **Build:** `npm run build` clean (type-checks the new mappers + hook wiring).

Rule: no em dashes in any code, comment, test, or doc produced here.

---

## Isolation contract (this runs in parallel with the other five plans)

Run in its own Claude instance + git worktree.

- **You own:** `src/lib/calendarModel.ts`; `src/hooks/useCalendarItems.ts`;
  `src/lib/calendarDemo.ts`.
- **Dependency:** this needs the Social + Campaigns ENDPOINTS to exist (a data
  dependency, not a file one). Run this LAST, after `social-wiring` and
  `campaigns-sms-wiring` have merged.
- **Do not touch:** the Social / Campaigns route folders or their endpoints;
  `src/demo/handler.ts` (put any new demo overlay in `src/lib/calendarDemo.ts`,
  which you own).
