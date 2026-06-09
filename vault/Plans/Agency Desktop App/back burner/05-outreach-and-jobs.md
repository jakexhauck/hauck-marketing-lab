---
type: plan
title: "Closed-loop outreach + scheduled jobs"
status: parked
tags: [plan, feature]
plan_kind: feature
created: "2026-05-19T13:54:53.000Z"
source: "docs/build-plans/Agency Desktop App/back burner/05-outreach-and-jobs.md"
---

# Closed-loop outreach + scheduled jobs

> Status: Proposed. Build outreach send/classify first; the scheduled-jobs framework wraps it.
> Effort: 3-5 days outreach. ~half a day for first 2 scheduled jobs, then ~2 hrs per additional job.
> Why this matters: Outreach is the #1 top-of-funnel lever and stops at "leads in a CSV" today. Scheduled jobs are the "while you sleep" layer that compounds every other build.
> Depends on: Activity + Briefing doc (every send/reply/job-run logs an event).

## What this build replaces

Two earlier docs (now merged): closed-loop outreach (send + classify + draft reply) and scheduled agents (cron-style background jobs). They overlap heavily; the reply poller and follow-up drafter are scheduled jobs that operate on the outreach pipeline.

---

## Part 1, Closed-loop outreach

### Why this matters

OutreachHub UI is built. Lead scraper produces leads. Sequences exist. Nothing sends. Every outbound today is Jake pasting drafts into Gmail manually, a hard ceiling on volume at exactly the moment volume is the lever.

This build converts the agency from "as many clients as Jake can personally prospect" into "as many as can be delivered."

### What we have today

- `OutreachHub.tsx`, `OutreachProspectPage.tsx`, `OutreachSequencePage.tsx`, UI for managing prospects + sequences.
- `lead-scraper/`, produces prospect CSVs.
- Gmail MCP, read + draft only (Anthropic gates `send` behind a human click intentionally).
- GHL, could absorb the send + reply pipeline entirely if Jake prefers that path.
- Vortex agent, already configured to write copy in Jake's voice.

### The send path, two options

Anthropic's Gmail MCP cannot send programmatically. Two real options:

| Option | Pros | Cons |
|---|---|---|
| **A. Gmail API direct** | Clean; we own deliverability story. | Dedicated warming needed if cold-emailing at scale; rate limits. |
| **B. Instantly / Smartlead via API** | Built for cold email: warming, deliverability, rotation. Scales to 500+/day. | External dependency + monthly cost. |

**Recommendation:** B (Instantly). Cold email at scale needs warming + rotation infrastructure we should not build ourselves. If Jake disagrees, A is straightforward.

### What "done" looks like

1. **Connect once.** Settings → Outreach → connect Instantly (API key) or Gmail (OAuth).
2. **Queue from prospect list.** From `OutreachProspectPage`, select N prospects + a sequence → "Queue for send". Each prospect gets the sequence's step-1 email, rendered through Vortex with their company name + scrape findings substituted.
3. **Sends fire on schedule.** Configurable: default `9am-5pm, prospect's local tz, 60-120s between sends, 50/day cap, M-F only`. Jake never clicks send.
4. **Replies land in a single Inbox view.** New `OutreachInboxPage` shows replies grouped by classification.
5. **Auto-classification.** Each reply gets routed through `claude -p` with a small classifier prompt: `interested / objection / not now / out-of-office / unsubscribe / unclear`.
6. **Auto-drafted response.** For `interested` and `objection`, Vortex drafts a reply pre-loaded into the prospect's thread view. Jake reviews → one click sends.
7. **Sequence pause on reply.** As soon as any reply arrives from a prospect, their sequence pauses automatically. No more cold steps go out to someone in conversation.

### Build steps

1. **Send adapter trait.** `app/src-tauri/src/outreach_send.rs`. Define `trait SendProvider { fn send(...); fn poll_replies(...); }`. Implementations: `InstantlyProvider`, `GmailProvider`. Pick at startup based on config. Stub provider for tests.

2. **Outbox queue.** `vault/outreach/outbox/<prospect-id>.json`, pending sends, retry counters, next-fire time. Background tick (every 30s) reads outbox, fires what's due, moves to `sent/`.

3. **Reply ingest.**
   - Instantly: webhook handler in Tauri (local-only HTTP server, OS port 0 or fixed), or polling every 5 min.
   - Gmail: poll `is:unread newer_than:5m`, filter to threads we sent into, fetch body.
   - Write each reply to `vault/outreach/replies/<prospect-id>/<timestamp>.md`.

4. **Classifier.** `app/src/lib/replyClassify.ts`, calls `claude -p` with a short prompt. Returns `{ category, confidence, summary }`. On `unsubscribe`: write to suppression list (`vault/outreach/suppression.json`), never email this address again.

5. **Auto-draft.** For `interested` / `objection`: call Vortex with the thread context + Jake's voice. Save to `vault/outreach/drafts/<prospect-id>-<timestamp>.md`. Show in `OutreachInboxPage` with an "Approve + send" button.

6. **Activity log entries.**
   - `outreach_sent · <prospect> · step <n>`
   - `outreach_reply · <prospect> · <category>`
   - `outreach_replied · <prospect>` (after Jake sends his reply)

7. **Guardrails.**
   - Hard cap: 80/day per Gmail account. Configurable for Instantly.
   - Domain throttle: max 3 prospects per same root domain per day.
   - Spam keyword scan on outbound + sequence pre-flight check.

### Open decisions

- **Send provider.** A or B. Recommendation above.
- **Inbox surface placement.** New `OutreachInboxPage` vs. an inbox tab inside `OutreachHub`. Recommend the latter.
- **Where Vortex auto-drafts run.** Live on inbox open (slow but always fresh) or as a scheduled job at 8am for all overnight replies (fast at open time, costs `claude -p` minutes overnight). Recommend the latter, see Part 2.
- **Confidence threshold for auto-draft.** Only draft when classifier confidence > 0.7. Lower stays in a "needs review" bucket.

### Out of scope

- LinkedIn outreach. Email only for v1.
- Phone / SMS follow-up sequencing.
- A/B testing subject lines (different doc).
- Replying without Jake's review. Always human-in-the-loop on send.

### Effort + leverage

- 3-5 days.
- Throughput jump: ~10× outbound for the same Jake-hours. If conversion holds, that is the customer acquisition story for the next 6 months.

---

## Part 2, Scheduled jobs framework

### Why this matters

A solo agency operator's lever is leverage. Anything that runs without Jake sitting at the keyboard compounds. The stack has everything needed to run cron-style agent jobs: Claude Code's `/schedule`, the activity log to write into, and a vault of files safe to modify automatically.

Concrete examples this unlocks:
- **Mornings already triaged.** Monday 8am draft of weekly recap emails for every live client.
- **Anomalies caught overnight.** A ROAS drop at 2am gets detected at 2:15, written to `vault/ops/alerts/`, surfaced as a hot activity entry.
- **Sales pipeline doesn't decay.** Prospects 3 days into "no reply" get a drafted follow-up automatically.
- **End-of-week summary writes itself.** Friday 5pm: a punch list of what shipped, stalled, hot.

### Decisions already made (do not relitigate)

- **Use `/schedule`, not trigger.dev or a custom job server.** Standing up trigger.dev to run 4-5 jobs is over-engineering when there's already a cloud-side runner. Revisit if jobs grow past ~20 or any needs heavy custom infra (browser automation, video encoding).
- **Every scheduled job ends by appending one `scheduled.run` event to `activity.jsonl`** with a summary. Heartbeat for the feed.
- **Jobs are conservative about state writes.** Each job's prompt enumerates exactly which files it may write. Never blanket repo access.
- **Jobs are idempotent.** Running twice in a row must not produce duplicate output. State in dedicated `last_run_at` fields or timestamped filenames.
- **One prompt file per job, version-controlled in `vault/ops/jobs/`.** Jake can read + edit in Obsidian; changes flow to next run.

### Open decisions

1. **Time zone.** All schedules local-time. Confirm `America/New_York` (or whatever Jake actually wants).
2. **Active hours.** Some jobs (followup-drafter, weekly-recap-drafter) weekdays-only. Confirm Mon-Fri 8am-6pm window.
3. **Recap recipients.** Pulled from `Profile.md` frontmatter; verify per client.
4. **KPI source for anomaly scans.** Until Meta Ads doc lands, anomaly detection has no real-time data. Default: defer anomaly-scan jobs until Meta Ads ships.

### Out of scope

- A UI to create / edit schedules inside the app. Use the `/schedule` CLI directly.
- Multi-user job assignment. Solo operator.
- Job retries / dead-letter queues. If a run fails, the next one tries again. Jake reads the activity log.
- Webhooks / external triggers. All jobs cron-driven.

### Target architecture

```
vault/
  ops/
    activity.jsonl              <- jobs write scheduled.run events here
    tracked_threads.json        <- read by reply-poller
    alerts/                     <- one file per fired alert
      2026-05-13-roas-drop-willis.md
    jobs/                       <- the prompts themselves
      reply-poller.md
      followup-drafter.md
      weekly-recap-drafter.md
      eow-punch-list.md
      anomaly-scanner.md          (deferred, needs Meta Ads)
  Outreach/<slug>/drafts/        <- followup-drafter writes here
  Clients/<slug>/                <- weekly-recap-drafter writes drafts here
```

Each job follows the same shape:

```
Cron fires
   → Claude opens vault/ops/jobs/<job>.md
   → Reads inputs (config files, prior state)
   → Does work (Gmail MCP / Drive MCP / claude -p as needed)
   → Writes outputs (drafts, alerts, recap drafts, etc.)
   → Appends one scheduled.run line to activity.jsonl
```

### Step 0, Verify `/schedule` capabilities

Before writing any jobs:
1. Can `/schedule` write to files in the local repo path?
2. Do jobs have access to `claude.ai Gmail` and `claude.ai Google Drive` MCPs by default?
3. Is there a way to list running schedules and stop one without losing history?

If any are no, fall back to Tauri-side `tokio::spawn` interval loops. Same prompts, local execution via `claude -p`. Tradeoff: only runs while the app is open. Acceptable for a solo operator who has the app open ~10 hrs/day.

**Verification:** create a test schedule that writes "hello" to `vault/ops/test.txt`. Wait. Confirm.

### Step 1, Reply poller

**File:** `vault/ops/jobs/reply-poller.md`. Cron: every 15 min.

Reads `vault/ops/tracked_threads.json` (written by the outreach send pipeline). For each tracked thread, polls Gmail MCP for new messages. New reply found → writes to `vault/outreach/replies/<prospect-id>/<timestamp>.md` + appends `outreach.reply` event with `hot: true` if classifier confidence > 0.7 on `interested` / `objection`.

### Step 2, Daily prospect follow-up drafter

**File:** `vault/ops/jobs/followup-drafter.md`. Cron: `30 8 * * 1-5` (Mon-Fri 8:30am local).

```
You are the HML follow-up drafter. Run every weekday at 8:30am Eastern.

Tools available: Read, Write, Edit, mcp__claude_ai_Gmail__create_draft.

Step 1. List all prospect profiles at vault/Outreach/*/profile.md.

Step 2. For each prospect:
  - Skip if status is anything except sequence-sent. (Closed, replied,
    scheduled, no-show, scraped, mockup-ready, all skipped.)
  - Skip if lastTouchedAt is within the last 72 hours.
  - Skip if a file already exists at
    vault/Outreach/<slug>/drafts/<YYYY-MM-DD>-followup-*.md (already
    drafted today).
  - Otherwise, the prospect is stalled. Read their profile, any prior
    drafts in vault/Outreach/<slug>/drafts/, and any prior replies in
    vault/Outreach/<slug>/replies/ for context.
  - Draft a short, casual follow-up email (3-5 sentences). It should
    NOT re-pitch the offer in full. Reference the prior email, add one
    new useful angle (a specific observation about the prospect's
    business, a relevant case study line, or a simple re-up), end with
    a low-friction CTA (one specific question or a "worth a quick call?").
  - Call mcp__claude_ai_Gmail__create_draft with the prospect's email.
  - Save the draft to vault/Outreach/<slug>/drafts/<YYYY-MM-DD>-followup-<short-slug>.md
    with frontmatter { to, subject, threadId, draftId, sentAt: null,
    kind: "followup", auto: true }.

Step 3. Append one summary entry to vault/ops/activity.jsonl:
{
  "ts": "<rfc3339>",
  "type": "scheduled.run",
  "summary": "Followup drafter: drafted N followups across M prospects",
  "meta": { "job": "followup-drafter", "drafted": N, "candidates": M }
}

Never send. Never modify a prospect's status. Never delete prior drafts.
```

**Verification:** create one test prospect with status `sequence-sent` and `lastTouchedAt` >72 hrs ago. Run the job. A draft appears in Gmail and on disk. Activity feed shows the run.

### Step 3, Friday end-of-week punch list

**File:** `vault/ops/jobs/eow-punch-list.md`. Cron: `0 17 * * 5` (Friday 5pm local).

```
You are the HML end-of-week summariser. Run every Friday at 5pm Eastern.

Tools available: Read, Write.

Step 1. Read vault/ops/activity.jsonl. Filter to entries from the past 7
days (ts within the last 168 hours).

Step 2. Bucket by type:
  - Forms run (count by form id).
  - Outreach: drafted, replied (with hot count).
  - Mockups generated.
  - Memory updates.
  - Scheduled jobs (job name + last-run summaries).

Step 3. Read vault/ops/tasks.json. Filter to tasks where status != "done".
Bucket by clientSlug (or "general").

Step 4. Write a single markdown file to
vault/ops/eow/<YYYY-MM-DD>-punch-list.md with sections:
  - "Week at a glance", one-paragraph summary.
  - "Outreach pipeline", # prospects by status, # replies, # hot, # follow-ups
    drafted but not yet sent (check for sentAt: null in drafts/).
  - "Client activity", for each client, what got produced this week.
  - "Open punch list", bulleted task list from tasks.json.
  - "Risks / things that stalled", any prospect that's been sequence-sent
    for >7 days without reply, any client with no activity at all this week,
    any scheduled job that hasn't fired.

Step 5. Append a scheduled.run event to activity.jsonl pointing at the
written file (refPath).

Never modify tasks.json. Never alter prospect or client state.
```

**Verification:** run manually. A punch list file appears. Activity feed has the entry. Skim the file: should read like a useful weekly brief, not a raw count dump.

### Step 4, Weekly client recap drafter

**Depends on:** Meta Ads doc ideally shipped, or a manually-maintained KPI snapshot in `vault/Clients/<slug>/Memory.md`. If neither, degrades to a "what we did for you this week" recap with no live numbers, still useful, less compelling.

**File:** `vault/ops/jobs/weekly-recap-drafter.md`. Cron: `30 7 * * 1` (Monday 7:30am local).

```
You are the HML weekly client recap drafter. Run every Monday at 7:30am Eastern.

Tools available: Read, Write, mcp__claude_ai_Gmail__create_draft.

Step 1. List clients at vault/Clients/*. For each client whose
status is "live" (read vault/Clients/<name>/Profile.md frontmatter):

Step 2. Gather inputs:
  - Past 7 days of activity.jsonl filtered to this clientSlug.
  - Most recent KPI snapshot (path varies, check
    media-buying/outputs/reports/<client>/ or wherever Zenith saves
    weekly reports).
  - Profile.md for primary contact name and email.

Step 3. Compose a short recap email (under 200 words):
  - One-line headline: spend, conversions, ROAS this week (if known).
  - 2-3 bullets of what was done this week.
  - 1-2 bullets on what's coming next week.
  - One specific call-out: a win, an opportunity, or a thing the
    client should decide.
  - Sign-off as Jake.

Step 4. Call mcp__claude_ai_Gmail__create_draft addressed to the
client's primary contact. Save the draft markdown to
vault/Clients/<name>/recaps/<YYYY-MM-DD>-recap.md.

Step 5. Append a scheduled.run event with summary
"Recap drafter: drafted N client recaps".

Never send. Never modify client status or profile.
```

**Verification:** with at least one live client whose Profile has an email contact, run the job. Draft email appears in Gmail. Markdown file appears in `vault/Clients/<name>/recaps/`. Activity feed shows it.

### Step 5, Anomaly scanner (deferred)

Park until Meta Ads doc ships. Without live data, "anomaly detection" has nothing to detect against.

When that lands, the job is roughly:

```
Every 2 hours (or every 15 min during launch days):
  For each live client:
    Pull latest hour of Meta/Google Ads metrics.
    Compare to rolling 7-day baseline.
    If ROAS < 0.6× baseline, or spend > 1.5× baseline, or CPC > 1.5× baseline:
      Write vault/ops/alerts/<YYYY-MM-DD>-<metric>-<client>.md with the
      finding and a snapshot of the offending account state.
      Append `{type: "alert.fired", hot: true, clientSlug, summary, refPath}`
      to activity.jsonl.
```

### Step 6, Surface schedules in the app

Lightweight UX add-on in `SettingsPage.tsx`:
- For each known job: name, schedule, last run (read from latest `scheduled.run` activity entry matching `meta.job`), result summary.
- "Run now" button per job, calls a Tauri command that triggers via `claude -p` with the prompt file inlined.

Not a job manager UI (don't build one). Just visibility.

### Testing plan per job

1. **Dry-run.** Paste the prompt into a fresh Claude Code session. Verify it produces the right files and doesn't go off the rails.
2. **First scheduled fire.** Set the cron 5 min ahead. Wait. Check artifacts + activity log.
3. **Idempotency.** Run twice back-to-back. Confirm no duplicate drafts or alerts.
4. **No state.** Delete the job's tracking inputs (e.g. clear `tracked_threads.json`). Run again. Confirm graceful "nothing to do."

### Verification checklist

- [ ] At least 3 jobs registered with `/schedule` (or Tauri intervals): reply poller, follow-up drafter, EOW punch list.
- [ ] Each has a corresponding `vault/ops/jobs/*.md` prompt file committed to repo.
- [ ] Every scheduled fire produces a `scheduled.run` entry in `activity.jsonl`.
- [ ] The Settings page shows job statuses.
- [ ] After at least one full week: every weekday morning has a fresh follow-up draft folder, every Monday has client recap drafts, every Friday has a punch list.
- [ ] No job has ever sent an email without Jake reviewing it. No job has ever destructively modified client state.
