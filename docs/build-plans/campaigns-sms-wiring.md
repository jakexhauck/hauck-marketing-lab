# Campaigns — wire the SMS side to real GoHighLevel

Combined spec + plan. Wire the client Campaigns section so the SMS half runs on
real customer data and can actually send. Email blasts are explicitly deferred
(they wait on a verified sending domain, currently on hold). A2P / SMS is
verified for the client, so SMS send works today.

Client-facing rule: the UI must NEVER name GoHighLevel, "GHL", "LeadConnector",
pipelines, opportunities, or any backend term. Customer-facing language only
("your customer list", "texts", "replies").

Wiring contract (follow it exactly):

- Real session: component -> `api('/api/campaigns/...')` -> Pages Function ->
  GHL -> shaped JSON back.
- Demo session: `api()` short-circuits to `handleDemoRequest()` against the
  in-memory store. Same return shapes either way.
- Send is a terminal action (real texts to real customers). It is gated and
  demo-aware: in demo it is a no-op success; in a real session it only fires
  when the SMS capability is present, and everything else shows honest empty /
  zeroed states until data exists.

---

## 1. Goal + Definition of Done

### Goal

Turn the SMS surfaces of Campaigns from demo-only into live features backed by
the client's real customer list and real texting number:

- Audiences read real customer segments (counts + a member sample).
- The New campaign flow can compose and SEND a real SMS blast to a chosen
  audience.
- Campaign results (sent / replies) read real numbers, SMS only.

### In scope (SMS)

- `Audiences` tab: real segment counts + member sample.
- `New campaign` dialog: SMS channel end to end, real Send.
- `Overview` + `Campaigns list` + `What's working`: real SMS KPIs and
  sent-history where GHL can supply them; honest empty/zeroed states elsewhere.

### Explicitly deferred (do NOT build here)

- Email blasts (send, open/click stats, email KPIs). Blocked on a verified
  sending domain, on hold. Email stays gated-off exactly as today: the channel
  card and email compose remain, Send stays disabled for email, and email KPIs
  keep showing the honest empty state. Do not remove email UI; just do not wire
  it.
- AI drafting ("Write it for me") and "Ideas for you". Separate ticket
  (`/api/campaigns/generate`), needs `ANTHROPIC_API_KEY`.
- Saving custom templates / custom audience builder ("New template",
  "New list"). Stay disabled with their existing "turns on once connected"
  toasts.
- Scheduled sends ("later"). v1 sends now only; the schedule step stays but
  "later" is disabled or falls back to now (see Spike S4).

### Definition of Done

- A real (connected) session on `Audiences` shows the client's real segment
  counts and a real member sample, sourced from GHL, with no fabricated numbers.
- In a real session, choosing an audience + SMS + a message + "Send now" sends a
  real text to every contact in that audience, and the dialog reports how many
  were queued. Verified against the test sub-account first, then Willis.
- Email Send stays disabled. No email data is fetched or shown as real.
- Demo mode is unchanged visually: every SMS surface still reads full from the
  in-memory store; no real network calls.
- A real session with no customer data shows the existing `NotConnectedNotice` /
  `EmptyState`, never zeros-dressed-as-data.
- No GoHighLevel term appears anywhere in the client UI.
- `npm run build` (tsc + vite) passes; endpoints smoke-tested live.

---

## 2. Sub-pages and what each needs

All under `src/routes/campaigns/` unless noted. Tabs come from
`CAMPAIGNS_TABS` in `src/lib/pageTabs.ts`.

| Surface | File | Needs (SMS) |
| --- | --- | --- |
| Overview ("Glance") | `CampaignsOverview.tsx` | KPI row (Sent this month, Replies, Jobs booked) from stats; "Up next" + "Recently sent" from campaign list. SMS rows only are real; email rows stay demo/empty. |
| Campaigns list | `CampaignsList.tsx` | List of sent/scheduled/draft campaigns with SMS delivery + reply results. Real session: empty state until a first send exists. |
| Audiences | `CampaignsAudiences.tsx` | Real segments + counts (grid), member sample in `AudienceDetailDialog`. This is the highest-value, most-certain piece. |
| Templates | `CampaignsTemplates.tsx` | No backend change. Stays demo-only starter set; "New template" stays disabled. |
| Reactivation | (already wired) | Out of scope, already live via `/api/campaigns/reactivation`. |
| What's working | `CampaignsInsights.tsx` | SMS summary KPIs + top SMS campaigns from stats; email KPI stays "—" in a real session. |
| New campaign dialog | `components/campaigns/NewCampaignDialog.tsx` | Audience list from real segments; SMS Send wired + gated; email path untouched (disabled Send). |

Shared consts + types live in `src/routes/campaigns/shared.tsx`
(`DEMO_CAMPAIGNS`, `DEMO_AUDIENCES`, `DEMO_TEMPLATES`, etc.). New real shapes go
in a new `src/lib/campaigns.ts` (mirrors the `reactivation.ts` pattern: shared
types + a `DEMO_*` fixture used by the demo handler).

---

## 3. Endpoints to build (`functions/api/campaigns/*`)

Pattern to copy: `functions/api/campaigns/reactivation.ts` (name-resolution,
`GhlContext` from `ctx.data.tenant`, honest `configError` on failure) and
`functions/api/sales/leads/index.ts`. Send path helper already exists:
`functions/lib/messaging.ts` -> `sendChannelMessage(ctx, contactId, {channel,
body})` which POSTs `/conversations/messages`. Contact fetch already exists:
`fetchAllContacts(ctx)` in `functions/lib/ghl.ts`.

### 3a. `GET /api/campaigns/audiences` (build first, most certain)

Returns the smart segments + counts + a small member sample.

- Fetch `fetchAllContacts(ctx)` and `fetchAllOpportunities(ctx)`.
- Derive segments in code (mirror `DEMO_AUDIENCES` ids/names):
  - `all` — every contact with a phone on file (SMS needs a phone).
  - `past` — no opportunity/job in last 12 months.
  - `vip` — 3+ opportunities.
  - `new` — first opportunity within 60 days.
  - `fivestar` — SPIKE S3 (needs a review/rating signal; likely a tag).
  - `noac` — SPIKE S3 (trade-specific; likely a tag or custom field).
- Response: `{ audiences: { id, name, count, desc, sample: {name, sub,
  initials}[] }[], configError? }`. Reuse the demo `desc` copy.
- SPIKE S1: confirm the exact segment field logic against real Willis data
  (which tags/custom fields exist). The `all`/`past`/`vip`/`new` four are
  derivable from contacts + opportunities today; `fivestar`/`noac` may need
  tag mapping. Ship the certain four first; gate the tag-based two behind a
  found-or-omitted check (omit a segment rather than show a wrong count).

### 3b. `POST /api/campaigns/send` — SPIKE S2, terminal + gated

Body: `{ audienceId: string, channel: "sms", body: string }`. (Email is
rejected here in v1: return `{ error: "email_deferred" }` 400 if
`channel === "email"`.)

Two candidate mechanisms (decide in Spike S2):

- Option A (per-contact loop, lowest risk, reuses proven code): resolve the
  audience to its contact ids (same derivation as 3a), then loop
  `sendChannelMessage(ctx, contactId, { channel: "SMS", body })` per contact.
  Personalize `{{first}}` server-side per contact. Respect rate limits
  (`ghlFetch` already backs off 429; add a small concurrency cap, e.g. 5 at a
  time, and a hard ceiling on audience size for v1, e.g. 500, to avoid a
  runaway blast). Returns `{ ok, queued, failed }`.
- Option B (GHL bulk action / campaign enrol): fire one GHL bulk-SMS or add the
  audience contacts to a GHL workflow/campaign that sends the text. Fewer calls,
  but the mechanism and payload are unverified and heavier to make idempotent.

Recommendation: build Option A (loop) for v1; it reuses the audited send path
and is trivially demo-mirrored. Note POSTs are NOT retried by `ghlFetch`
(dedupe risk), which is correct here: a failed contact is reported, not silently
re-sent.

Idempotency: generate a `campaignId` server-side and tag each contact
(`campaign:<id>`) or record it so a double-submit does not double-text. SPIKE
S2 covers whether we persist campaigns (Supabase) or rely on a GHL tag.

### 3c. `GET /api/campaigns/stats` — SPIKE S5

Powers Overview KPIs, the list results, and What's-working. Returns SMS-only
counts: `{ sentThisMonth, replies, jobsBooked, campaigns: {id, title, sentAt,
sent, replies, result}[] }`.

- `sent` / `replies`: SPIKE S5 — confirm the GHL source. Likely derive from
  `/conversations/search` outbound-SMS counts filtered by a campaign tag, or
  from the campaign/bulk-action report endpoint if Option B is chosen.
- `jobsBooked`: reuse the opportunity/attribution join already used elsewhere
  (best-effort; may stay empty in v1 with an honest state).
- If no reliable source is found, this endpoint returns zeros + `configError`
  and the surfaces keep their honest empty states. Do NOT invent numbers.

All three endpoints inherit auth from `functions/api/_middleware.ts`
(`ctx.data.tenant` carries the live/test GHL token + location). No new env vars
for SMS (A2P sender already registered in GHL). No `ANTHROPIC_API_KEY` needed
(AI is out of scope).

---

## 4. File-by-file steps

### Backend

1. `functions/api/campaigns/audiences.ts` (new) — `onRequestGet`. Section 3a.
   Copy structure from `reactivation.ts`.
2. `functions/api/campaigns/send.ts` (new) — `onRequestPost`. Section 3b,
   Option A. Reuse `sendChannelMessage`. Reject `channel === "email"`.
3. `functions/api/campaigns/stats.ts` (new) — `onRequestGet`. Section 3c.
   Ship with a graceful `configError` fallback.

### Frontend shared shapes

4. `src/lib/campaigns.ts` (new) — export `ApiAudience`, `ApiCampaignStats`,
   `SendCampaignInput`, and `DEMO_AUDIENCES_DATA` / `DEMO_CAMPAIGN_STATS`
   fixtures (mirror `src/lib/reactivation.ts`). Keep the demo values in sync
   with the existing `DEMO_AUDIENCES` / `DEMO_INSIGHTS` in `shared.tsx` (or
   re-export from there) so demo output is unchanged.

### Frontend hooks

5. `src/hooks/useAudiences.ts` (new) — `useQuery(['campaigns','audiences'])`
   -> `api('/api/campaigns/audiences')`. Mirror `useReactivation.ts`.
6. `src/hooks/useCampaignStats.ts` (new) — `useQuery(['campaigns','stats'])`
   -> `api('/api/campaigns/stats')`.
7. `src/hooks/useSendCampaign.ts` (new) — `useMutation` ->
   `api('/api/campaigns/send', { method:'POST', body })`. On success invalidate
   `['campaigns','stats']`.

### Frontend surface switches (real -> hook, demo -> unchanged fixture)

8. `CampaignsAudiences.tsx` — replace the `DEMO_AUDIENCES` map with
   `useAudiences(!demo)`; in demo keep the current fixture render. Real session
   with `configError` / empty -> keep `NotConnectedNotice` + `EmptyState`.
   Feed the real audience into `AudienceDetailDialog` (member sample).
9. `NewCampaignDialog.tsx` — audience step lists real segments (from
   `useAudiences`) in a real session, demo fixture in demo. Wire the final Send
   button:
   - Email channel: leave Send disabled exactly as now (deferred).
   - SMS channel: Send enabled only when `demo` OR the SMS capability is present
     (Step 5 gating). On click: demo -> `showToast` success + close (no-op via
     the demo handler); real -> `useSendCampaign` mutate, then a success toast
     with the queued count and close. Keep the "Sending turns on once your
     account is connected" note only when the capability is absent.
10. `CampaignsOverview.tsx` / `CampaignsList.tsx` / `CampaignsInsights.tsx` —
    swap `SAMPLE_KPIS` / `DEMO_INSIGHTS` / `DEMO_CAMPAIGNS` for
    `useCampaignStats(!demo)` in a real session; demo keeps its fixtures. Only
    populate SMS figures; email KPI stays "—"/empty in a real session. Preserve
    every existing empty state.

### Demo handler

11. `src/demo/handler.ts` — add cases (place near the existing
    `/api/campaigns/reactivation` line):
    - `GET /api/campaigns/audiences` -> `return r(DEMO_AUDIENCES_DATA)`.
    - `GET /api/campaigns/stats` -> `return r(DEMO_CAMPAIGN_STATS)`.
    - `POST /api/campaigns/send` -> `return r({ ok:true, queued: <audience
      count>, failed:0 })` (no store mutation needed; a blast has no per-thread
      demo view). Match on `seg[1]==='campaigns' && seg[2]==='send'`.

### Gating

12. SMS send capability: reuse the entitlements pattern
    (`/api/entitlements` -> `capabilities`). Add/consume a capability such as
    `campaigns.sms` set per tenant when A2P is verified. The dialog enables SMS
    Send when `demo || capabilities.includes('campaigns.sms')`. If the app has
    no finer-grained capability plumbing yet, gate on "a real session that
    returned audiences successfully" as the interim signal, and leave a TODO to
    formalize the capability. Never enable email Send.

---

## 5. Verification

1. `npm run build` (tsc + vite) clean.
2. Demo tab (`?demo=1`): Audiences, Overview, list, What's-working all read full
   exactly as before; New campaign SMS -> Send shows the success toast; no
   network calls in the Network panel.
3. Real session on the TEST sub-account (not Willis first):
   - `GET /api/campaigns/audiences` returns real counts; spot-check one count
     against the GHL contact list.
   - `AudienceDetailDialog` shows a real member sample.
   - Compose a short SMS to a tiny test audience (or a one-contact test segment)
     and Send; confirm the text actually arrives on a real handset and the
     dialog reports `queued` correctly.
   - `GET /api/campaigns/stats` returns real (or honest-zero) numbers; no
     fabricated values.
4. Empty-state check: a location with no contacts shows `NotConnectedNotice` +
   `EmptyState`, never zeros-as-data.
5. Email check: email channel Send stays disabled; no email endpoint is called.
6. Client-language check: grep the built bundle and the changed files for
   "GHL", "GoHighLevel", "LeadConnector", "opportunit", "pipeline" in any
   client-visible string. Must be zero.
7. Only after test passes: repeat the Send test on Willis with a 1-contact
   internal segment before any real customer blast.

---

## 6. Spikes (confirm BEFORE building the send)

- S1 (audiences): confirm the real Willis contact/opportunity fields for each
  segment. The four count-derivable segments (all/past/vip/new) are safe;
  `fivestar` + `noac` need a tag/custom-field. Omit any segment we cannot
  compute rather than guess.
- S2 (send mechanism — the critical one): confirm the GHL SMS-blast path before
  building. Verify Option A (per-contact loop over
  `POST /conversations/messages` via `sendChannelMessage`) actually delivers to
  multiple contacts and respects rate limits, versus Option B (a GHL
  bulk-action or workflow enrol). Decide idempotency (server `campaignId` +
  contact tag vs a Supabase campaigns table). Recommendation: Option A + tag.
  Do a live one-contact then two-contact test on the test sub-account.
- S3 (personalization): confirm `{{first}}` substitution. In the loop we can
  fill server-side from the contact's first name; verify GHL does not also
  expand tokens (double-substitution risk).
- S4 (schedule): confirm whether "Send later" is worth wiring in v1 (needs a
  GHL scheduled-send or our own cron). If not, disable "later" and ship
  send-now only.
- S5 (stats): confirm where SMS delivered/reply counts come from
  (conversation-search counts filtered by campaign tag, vs a GHL campaign
  report endpoint). If unreliable, `/api/campaigns/stats` ships returning
  honest zeros + `configError` and the surfaces keep their empty states.

Spike ordering: S2 gates the whole build. Do S1 + S2 first (both hit the test
sub-account), then build audiences -> send -> stats in that order.
