# 04 — Scheduled Agents (the "while you sleep" layer)

> **Status:** Proposed. Several concrete jobs, one shared infrastructure call.
> **Effort:** ~half a day to set up the first 2 jobs. Add more as you go.
> **Depends on:** 02 (Outreach send + reply tracking) and 03 (Activity Log)
> shipped first. This is the wrapper that uses both.

---

## Why this matters

A solo agency operator's lever is leverage. Anything that runs without Jake
sitting at the keyboard compounds. The HML stack has everything needed to
run cron-style agent jobs: a `/schedule` system available in Claude Code,
the activity log to write into, and a vault of files that are safe to
modify automatically.

Concrete examples this unlocks:

- **Mornings already triaged.** Monday 8am draft: weekly recap emails for
  every live client, pre-populated with last week's KPIs, ready to read +
  send by 9am.
- **Anomalies caught overnight.** A ROAS drop at 2am for a live client gets
  detected at 2:15am, written to `vault/ops/alerts/`, surfaced as a hot
  activity entry. By the time Jake checks his phone at 7am, the alert is
  already there.
- **Sales pipeline doesn't decay.** Prospects 3 days into "no reply" get a
  drafted follow-up automatically. Jake reviews and clicks Send.
- **End-of-week summary writes itself.** Friday 5pm: a punch list of what
  shipped, what stalled, what's hot.

---

## Background a new terminal needs

The HML app sits at `C:\Users\games\Desktop\hauck-marketing-lab\`. Universal
constraints in `recommended improvements/README.md`.

Two prior briefs are prerequisites:

- **03 — Activity Log + Memory Write-back** must be shipped. Scheduled jobs
  write into `vault/ops/activity.jsonl` using `type: "scheduled.run"` and
  occasionally other types like `outreach.reply` or `alert.fired`.
- **02 — Outreach Send + Reply Tracking** ideally shipped so the daily
  follow-up drafter has prospects to draft for.

The scheduled-job mechanism itself is **Claude Code's `/schedule`** (the
"schedule" skill listed in the agent surface). It lets you register a
prompt against a cron pattern; the prompt runs in Anthropic's cloud and can
use any of the tools enabled for that schedule, including reading and
writing files in the user's repos via the configured working directory.

If `/schedule` cannot reach the user's local repo (verify this in Step 0
below), fall back to Tauri-side `tokio::spawn` interval loops — same prompt
body, just executed locally via `claude -p` whenever the app is open. The
tradeoff: Tauri-side loops only run while the app is open. That's
acceptable for a solo operator who has the app open ~10 hours a day.

---

## Decisions already made (do not relitigate)

- **Use `/schedule`, not trigger.dev or a custom job server.** trigger.dev
  is a fully capable v4 platform we know how to use, but standing up a
  trigger.dev project just to run 4-5 jobs that already have a working
  cloud-side runner is over-engineering. Revisit if jobs grow past ~20
  or if any job needs heavy custom infra (browser automation, video
  encoding, etc.).
- **Every scheduled job ends by appending one `scheduled.run` event to
  `activity.jsonl`** with a summary of what it did. This is the heartbeat
  — Jake sees in the feed when each job last ran and what it accomplished.
- **Jobs are conservative about state writes.** Each job's prompt
  enumerates exactly which files it may write. Never grant blanket repo
  access.
- **Jobs are idempotent.** Running the same job twice in a row must not
  produce duplicate output. State tracked in dedicated `last_run_at`
  fields or in the artifact filenames themselves (timestamped).
- **One prompt file per job, version-controlled in `vault/ops/jobs/`.**
  This lets Jake read the prompt without leaving the repo, edit it in
  Obsidian, and have changes flow to the next scheduled run.

---

## Open decisions (confirm before coding)

1. **Time zone.** All schedules are local-time to Jake. Confirm:
   `America/New_York` (or whatever Jake actually wants).
2. **Active hours.** Some jobs (followup-drafter, weekly-recap-drafter)
   should only run on weekdays. Confirm Mon-Fri 8am-6pm window.
3. **Recap recipients.** Weekly recap drafter creates drafts addressed to
   each client's primary contact. Confirm that primary contact email is
   pulled from `vault/Clients/<slug>/Profile.md` frontmatter — likely
   already there but verify per client.
4. **KPI source for anomaly scans.** Until 01 (Meta/Google Ads APIs)
   lands, anomaly detection has no real-time data. Two choices:
   - Defer anomaly-scan jobs until 01 ships.
   - Run anomaly scans against the most recently saved Zenith KPI snapshot
     (entered manually). Crude but functional.
   Default: defer until 01.

---

## Out of scope

- A UI to create / edit schedules inside the app. Use the `/schedule` CLI
  directly. (Future, maybe.)
- Multi-user job assignment. Solo operator.
- Job retries / dead-letter queues. If a run fails, the next one tries
  again. Jake reads the activity log.
- Webhooks / external triggers. All jobs are cron-driven.

---

## Target architecture

```
vault/
  ops/
    activity.jsonl              <- jobs write `scheduled.run` events here
    tracked_threads.json        <- read by reply-poller (doc 02)
    alerts/                     <- one file per fired alert
      2026-05-13-roas-drop-willis.md
    jobs/                       <- the prompts themselves, version-controlled
      reply-poller.md
      followup-drafter.md
      weekly-recap-drafter.md
      eow-punch-list.md
      anomaly-scanner.md          (deferred — needs 01)
  Outreach/<slug>/drafts/        <- followup-drafter writes here
  Clients/<slug>/                <- weekly-recap-drafter writes drafts here
```

Each scheduled job follows the same shape:

```
Cron fires
   |
   v
Claude opens the job prompt at vault/ops/jobs/<job>.md
   |
   v
Job reads its inputs (config files, prior state)
   |
   v
Job does its work (calls Gmail MCP / Drive MCP / claude -p as needed)
   |
   v
Job writes its outputs (drafts, alerts, recap drafts, etc.)
   |
   v
Job appends a single scheduled.run line to activity.jsonl
```

---

## Implementation plan

### Step 0 — Verify `/schedule` capabilities

Before writing any jobs, confirm:

1. `/schedule` can write to files in `C:\Users\games\Desktop\hauck-marketing-lab\`.
2. `/schedule` jobs have access to `claude.ai Gmail` and `claude.ai Google
   Drive` MCPs by default, or whether each schedule registers tools
   independently.
3. There is a way to list running schedules and stop one without losing
   history.

If any of these are no, switch to the Tauri-side `tokio::spawn` fallback
described under Step 5 of doc 02 and reapply that pattern for every job
below. Same prompts, different runner.

**Verification:** create a one-off test schedule that simply writes "hello"
to `vault/ops/test.txt`. Wait for it to fire. Confirm the file appears.

---

### Step 1 — Reply poller (already designed in doc 02)

Don't duplicate the work. Just point at it:

- Prompt body: `vault/ops/jobs/reply-poller.md`. Contents come from doc 02
  Step 5 Option A verbatim.
- Schedule: every 15 min.
- Already covered. Mark this step complete when doc 02 Step 5 is.

---

### Step 2 — Daily prospect follow-up drafter

**File:** `vault/ops/jobs/followup-drafter.md` (new)

```
You are the HML follow-up drafter. Run every weekday at 8:30am Eastern.

Tools available: Read, Write, Edit, mcp__claude_ai_Gmail__create_draft.

Step 1. List all prospect profiles at vault/Outreach/*/profile.md.

Step 2. For each prospect:
  - Skip if status is anything except sequence-sent. (Closed, replied,
    scheduled, no-show, scraped, mockup-ready — all skipped.)
  - Skip if lastTouchedAt is within the last 72 hours.
  - Skip if a file already exists at
    vault/Outreach/<slug>/drafts/<YYYY-MM-DD>-followup-*.md (already
    drafted today).
  - Otherwise, the prospect is stalled. Read their profile, any prior
    drafts in vault/Outreach/<slug>/drafts/, and any prior replies in
    vault/Outreach/<slug>/replies/ for context.
  - Draft a short, casual follow-up email (3-5 sentences). It should
    NOT re-pitch the offer in full — it should reference the prior
    email, add one new useful angle (a specific observation about the
    prospect's business, a relevant case study line, or a simple
    re-up), and end with a low-friction CTA (one specific question or
    a "worth a quick call?" line).
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

Schedule: `30 8 * * 1-5` (Mon-Fri 8:30am local).

**Verification:** create one test prospect with status `sequence-sent` and
`lastTouchedAt` more than 72 hours ago. Run the job. A draft appears in
Gmail and on disk. Activity feed shows the run.

---

### Step 3 — Friday end-of-week punch list

**File:** `vault/ops/jobs/eow-punch-list.md` (new)

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
  - "Week at a glance" — one-paragraph summary.
  - "Outreach pipeline" — # prospects by status (read from
    vault/Outreach/*/profile.md), # replies, # hot, # follow-ups
    drafted but not yet sent (check for sentAt: null in drafts/).
  - "Client activity" — for each client, what got produced this week.
  - "Open punch list" — bulleted task list from tasks.json.
  - "Risks / things that stalled" — any prospect that's been
    sequence-sent for >7 days without reply, any client with no
    activity at all this week, any scheduled job that hasn't fired.

Step 5. Append a scheduled.run event to activity.jsonl pointing at the
written file (refPath).

Never modify tasks.json. Never alter prospect or client state.
```

Schedule: `0 17 * * 5` (Friday 5pm local).

**Verification:** run it manually. A punch list file appears at the expected
path. Activity feed has the entry. Open the file and skim it — it should
read like a useful weekly brief, not a dump of raw counts.

---

### Step 4 — Weekly client recap drafter

**Depends on:** doc 01 ideally shipped, or a manually-maintained KPI
snapshot in `vault/Clients/<slug>/Memory.md` or wherever Zenith currently
saves data. If neither, this job degrades to a "what we did for you this
week" recap with no live numbers — still useful, but less compelling.

**File:** `vault/ops/jobs/weekly-recap-drafter.md` (new)

```
You are the HML weekly client recap drafter. Run every Monday at 7:30am
Eastern.

Tools available: Read, Write, mcp__claude_ai_Gmail__create_draft.

Step 1. List clients at vault/Clients/*. For each client whose
status is "live" (read vault/Clients/<name>/Profile.md frontmatter):

Step 2. Gather inputs:
  - Past 7 days of activity.jsonl filtered to this clientSlug.
  - Most recent KPI snapshot (path varies — check
    media-buying/outputs/reports/<client>/, or wherever Zenith saves
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

Schedule: `30 7 * * 1` (Monday 7:30am local).

**Verification:** with at least one live client whose Profile has an email
contact, run the job. A draft email appears in Gmail. A markdown file
appears in `vault/Clients/<name>/recaps/`. Activity feed shows it.

---

### Step 5 — (Deferred) Anomaly scanner

Park this until doc 01 ships Meta + Google Ads APIs. Without live data,
"anomaly detection" has nothing to detect against.

When 01 lands, the job is roughly:

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

---

### Step 6 — Surface schedules in the app

Lightweight UX add-on. **File:** add a "Scheduled jobs" section to the
Settings page (`app/src/components/SettingsPage.tsx`):

- For each known job, show: name, schedule, last run (read from latest
  `scheduled.run` activity entry matching `meta.job`), result summary.
- A "Run now" button for each — calls a Tauri command that triggers the
  job via `claude -p` with the prompt file inlined.

This isn't a job manager UI (don't build one). It's just visibility.

**Verification:** Settings page shows 4 jobs with their last run times. "Run
now" works.

---

## Testing plan

For each job:

1. **Dry-run.** Read the job prompt with no actual schedule fire — just
   paste the prompt into a fresh Claude Code session and let it run. Verify
   it produces the right files and doesn't go off the rails.
2. **First scheduled fire.** Set the cron to fire 5 minutes from now. Wait.
   Check artifacts and activity log.
3. **Idempotency.** Run twice back-to-back. Confirm no duplicate drafts or
   alerts.
4. **No state.** Delete the job's tracking inputs (e.g. clear
   `tracked_threads.json`). Run again. Confirm graceful "nothing to do."

---

## How to verify this shipped

- [ ] At least 3 jobs are registered with `/schedule` (or running via
      Tauri-side intervals): reply poller, follow-up drafter, EOW punch
      list.
- [ ] Each job has a corresponding `vault/ops/jobs/*.md` prompt file
      committed to the repo.
- [ ] Every scheduled fire produces a `scheduled.run` entry in
      `activity.jsonl`.
- [ ] The Settings page shows job statuses.
- [ ] Jake confirms: at least one full week has passed where every weekday
      morning has a fresh follow-up draft folder, every Monday has client
      recap drafts, every Friday has a punch list.
- [ ] No job has ever sent an email without Jake reviewing it. No job has
      ever destructively modified client state.
