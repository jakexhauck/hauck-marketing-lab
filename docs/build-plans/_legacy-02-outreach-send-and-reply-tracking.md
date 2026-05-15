# 02 — Outreach Send + Reply Tracking

> **Status:** Designed in detail.
> **Effort:** 1-2 days.
> **Depends on:** 03 (Activity Log) ideally shipped first so this can write
> into it. Will gracefully no-op activity logging if 03 isn't there yet.

---

## Why this matters

This is the single largest customer-acquisition lever on the list. The HML app
has a fully built prospect pipeline UI (`OutreachHub`, `OutreachProspectPage`,
`OutreachSequencePage`, lead scraper, web designer for mockups) but stops one
step short of value: there's no way to send the outreach email and no way to
know when a prospect replies.

Today, the workflow is:

1. Scrape leads (in-app).
2. Generate a mockup (in-app).
3. Generate sequence drafts (in-app).
4. **Copy/paste into Gmail. Send by hand. Manually flip the prospect's status.
   Watch Gmail for replies. Manually flip status again. Forget half the
   prospects.**

After this ships:

1. Scrape leads (in-app).
2. Generate a mockup (in-app).
3. Click "Draft via Gmail" → Gmail draft appears in your inbox.
4. Click Send in Gmail (the one human-in-the-loop step Anthropic enforces).
5. Status auto-flips to `sequence-sent`.
6. A scheduled job polls Gmail every 15 min. When a prospect replies, the
   status auto-flips to `replied`, the reply is saved to disk, and a
   notification fires. "Hot" replies (pricing / booking language) get an
   amber flag.

The 4-step manual loop becomes a 1-click + 1-glance loop.

---

## Background a new terminal needs

You are working in the HML Tauri app at
`C:\Users\games\Desktop\hauck-marketing-lab\`. Stack: Tauri (Rust + React),
folder-as-database, `claude -p` shelled out for LLM work, no DB, no cloud.
The full constraint list lives at `recommended improvements/README.md`.

### Outreach state today (read these before coding)

- `vault/Outreach/<slug>/profile.md` — frontmatter has prospect fields
  (`name`, `niche`, `status`, `url`, `lastTouchedAt`, optional `email`).
- `app/src/lib/navigation.ts` — `ProspectEntry` and `ProspectStatus` types.
  Note `prospectStatusPill` for the colored chip.
- `app/src-tauri/src/prospects.rs` — list / read / add / delete / status
  update commands.
- `app/src/components/MainDashboard/OutreachProspectPage.tsx` — the per-
  prospect view. **This is where the "Draft via Gmail" button lives.**
- `app/src/components/MainDashboard/OutreachSequencePage.tsx` — sequence
  builder. Sequence steps will trigger drafts the same way.
- `app/src/components/MainDashboard/OutreachHub.tsx` — list view of prospects.

### Gmail MCP — what it can and can't do

The `claude.ai Gmail` MCP is installed globally and is **inherited by
`claude -p` subprocesses** (verified by listing the tool surface inside a
`claude -p` call). Tool prefix is `mcp__claude_ai_Gmail__`.

| Capability | Available |
|---|---|
| `create_draft` | ✓ |
| `list_drafts` | ✓ |
| `search_threads` | ✓ |
| `get_thread` | ✓ |
| `label_*` (create/apply/remove labels) | ✓ |
| Programmatic send | **✗ Not exposed** |

**Send is intentionally gated.** A Gmail draft requires the user to open Gmail
and click Send. Do not try to work around this — it's a deliberate Anthropic
safety boundary and embracing it keeps deliverability sane (no rogue mail
merges).

The sending address used in all drafts is `contact.jakehauck@gmail.com`. This
is the address the user authorised in the Gmail MCP and is the only address
drafts can be created from.

---

## Decisions already made (do not relitigate)

- **Drafts only.** The "Send" button drafts the email into Gmail and tells
  the user "Open Gmail to review and send." It does **not** call any
  programmatic send. See above for why.
- **Use the existing `claude.ai Gmail` MCP, not Composio.** Composio is not
  installed and is not needed for this work. If true one-click auto-send
  becomes a hard requirement later, layer Composio's `GMAIL_SEND_EMAIL` on
  top — but that's a separate decision.
- **Reply polling is via Claude's `/schedule` (remote cron) not a local
  background poller.** Reasons: no app needs to be running, no Tauri sidecar
  daemon, no platform-specific service files. The scheduled job runs in
  Anthropic's cloud and writes files into the local repo via the git sync
  loop. *Confirm `/schedule` can write to local files in this repo's sync
  layout before relying on it. If not, fall back to a Tauri-side
  `tokio::spawn` interval inside the running app.* See Open Decisions.
- **One `tracked_threads.json` file**, not a sidecar per prospect. Cheap to
  read, cheap to update, easy to inspect. Lives at
  `vault/ops/tracked_threads.json`.
- **Reply detection writes a markdown file**, not just a status flip. The
  file is the artifact — the status flip is just metadata. Following the
  project's "folder is the source of truth" rule.
- **"Hot reply" detection runs inside the same scheduled poller**, not as a
  separate job. The LLM is already reading the reply to summarise it; one
  extra instruction to flag booking / pricing language costs ~50 tokens.

---

## Open decisions (confirm before coding)

1. **`/schedule` write-back path.** Verify that a Claude `/schedule` job can
   commit files into Jake's `jakexhauck/hauck-marketing-lab` repo. If
   `/schedule` is a hosted cron with no repo write access, switch the
   poller to a Tauri-side `tokio::spawn` loop that runs while the app is
   open. This is a meaningful architecture branch — confirm before Step 5.
2. **Prospect email source.** Today `ProspectEntry` does **not** carry an
   email field. Either:
   - (a) add an optional `email` field to the prospect frontmatter and
     surface it in `OutreachProspectPage` for manual entry / scraper
     enrichment, **or**
   - (b) require the user to paste the recipient in the draft modal.
   Default: ship (a). Scraper enrichment can come later.
3. **Sequence multi-step drafts.** When a sequence has 3 steps, do we
   pre-draft all 3 the moment the user clicks "Send sequence" (and let them
   manually send each), or draft them one at a time as each prior step is
   sent? Default: one at a time, triggered by the daily follow-up scheduler
   in 04. Avoids stale drafts.
4. **Hot-flag rules.** Default keyword set: `pric`, `cost`, `quote`,
   `interested`, `call`, `book`, `schedule`, `demo`, `available`, `when can`,
   `how soon`. Tunable later. Confirm or replace before coding the poller
   prompt.

---

## Out of scope

- Auto-send. See Decisions.
- A/B testing across subject lines or copy. (Future, separate brief.)
- Multi-inbox support (sending from different addresses per client).
- Bounce / spam handling. Gmail surfaces these in its own UI; we don't
  parse them.
- Email warm-up / domain reputation tooling.

---

## Target architecture

```
vault/
  Outreach/
    <prospect-slug>/
      profile.md          <- existing, adds threadIds[] and email
      drafts/
        2026-05-13-mockup-intro.md     <- new, one file per drafted email
      replies/
        2026-05-13-acme-roofing.md     <- new, one file per detected reply
  ops/
    tracked_threads.json  <- new, {threadId: {prospectSlug, lastCheckedAt}}
    activity.jsonl        <- from doc 03, this work appends to it
```

Send flow:

```
[User clicks "Draft via Gmail" on a prospect]
              |
              v
   DraftModal collects: subject, body (pre-filled from sequence/mockup)
              |
              v
   `claude -p` with Gmail MCP: create_draft(to, subject, body)
              |
              v
   Save draft markdown to vault/Outreach/<slug>/drafts/
   Append threadId to prospect.profile.md frontmatter
   Append entry to vault/ops/tracked_threads.json
   Set prospect status: sequence-sent
   logActivity({ type: "outreach.drafted", prospectSlug, refPath })
              |
              v
   Toast: "Draft created. Open Gmail to review and send →"
   (link opens https://mail.google.com/mail/u/0/#drafts)
```

Reply poll flow (runs every 15 min):

```
Scheduled job (Claude /schedule or Tauri interval):
   Read vault/ops/tracked_threads.json
   For each tracked thread:
     mcp__claude_ai_Gmail__get_thread(threadId)
     If new inbound messages since lastCheckedAt:
       For each new message:
         Summarise (~2 sentences)
         Detect hot signals (booking/pricing keywords)
         Write vault/Outreach/<slug>/replies/<ts>-<from>.md
         Append entry to vault/ops/activity.jsonl
         If prospect status was sequence-sent: flip to replied
       Update lastCheckedAt
```

---

## Schema: prospect profile frontmatter (additions)

Add to `vault/Outreach/<slug>/profile.md` frontmatter (extending whatever
`prospects.rs` currently parses):

```yaml
---
name: Acme Roofing
slug: acme-roofing
niche: roofing
status: sequence-sent
url: https://acmeroofing.com
email: jim@acmeroofing.com         # new: optional
lastTouchedAt: 2026-05-13T19:01:33Z
threadIds:                          # new: array of Gmail thread ids
  - "1898abc123..."
---
```

Add to `tracked_threads.json` (new file):

```json
{
  "version": 1,
  "threads": {
    "1898abc123...": {
      "prospectSlug": "acme-roofing",
      "createdAt": "2026-05-13T19:01:33Z",
      "lastCheckedAt": "2026-05-13T19:15:00Z"
    }
  }
}
```

---

## Implementation plan

### Step 1 — Extend prospect schema with `email` and `threadIds`

**File:** `app/src-tauri/src/prospects.rs`

Add optional `email: Option<String>` and `thread_ids: Vec<String>` to whatever
struct represents a prospect frontmatter. Make sure serde defaults / skips
are set so older profile files without these fields still parse.

**File:** `app/src/lib/navigation.ts` (or wherever `ProspectEntry` lives — see
the existing union in this file)

```ts
export interface ProspectEntry {
  slug: string;
  name: string;
  niche?: string | null;
  status: ProspectStatus;
  url?: string | null;
  email?: string | null;     // new
  threadIds?: string[];      // new
  lastTouchedAt?: string | null;
}
```

**File:** `app/src/components/MainDashboard/OutreachProspectPage.tsx`

Surface the email field. If empty, render an inline "Add email" affordance
that updates the profile via the existing prospect-update command.

**Verification:** open Willis-or-whoever's prospect page, see the email
field. Edit, save, reload — persists.

---

### Step 2 — Add the Gmail-draft Tauri command

**File:** `app/src-tauri/src/gmail.rs` (new)

This module wraps the existing `claude::invoke_claude` (or whatever the
subprocess helper is — see `app/src-tauri/src/claude.rs`). The Rust side
doesn't talk to Gmail directly; it asks the model to call the MCP tool.

```rust
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Deserialize)]
pub struct DraftEmailArgs {
    pub to: String,
    pub subject: String,
    pub body: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DraftEmailResult {
    pub draft_id: String,
    pub thread_id: String,
    pub message_id: String,
    pub sent_at: String,    // RFC3339, set when create_draft succeeds
}

#[tauri::command]
pub async fn draft_outreach_email(
    app: AppHandle,
    args: DraftEmailArgs,
) -> Result<DraftEmailResult, String> {
    let prompt = format!(
        "Use the Gmail MCP tool `mcp__claude_ai_Gmail__create_draft` to create \
         a new Gmail draft with these fields:\n\
         To: {to}\nSubject: {subject}\nBody:\n{body}\n\n\
         After the tool returns successfully, output ONLY a single JSON object \
         on one line with these exact keys: draft_id, thread_id, message_id. \
         No prose. No code fences. No commentary.",
        to = args.to, subject = args.subject, body = args.body,
    );
    // Reuse the existing subprocess runner. The exact API depends on what
    // `claude.rs` exposes; adapt the call.
    let output = crate::claude::run_one_shot(&app, &prompt).await?;
    let parsed: DraftEmailResult = serde_json::from_str(output.trim())
        .map_err(|e| format!("parse draft result: {e} (raw: {output})"))?;
    Ok(parsed)
}
```

Register in `lib.rs`: `mod gmail;` + `gmail::draft_outreach_email,` in the
handler list.

**Verification:** in the Rust shell or via a temporary "Test draft" button,
call `draft_outreach_email` with a real Gmail address. Open
[mail.google.com/mail/u/0/#drafts](https://mail.google.com/mail/u/0/#drafts) —
the draft is there with the exact subject and body.

---

### Step 3 — Add the "Draft via Gmail" UI

**File:** `app/src/components/MainDashboard/OutreachProspectPage.tsx`

Add a button near the prospect's action buttons:

```tsx
<button
  type="button"
  className="hml-btn"
  disabled={!prospect.email}
  title={prospect.email ? "Draft a Gmail email" : "Add an email first"}
  onClick={() => setDraftModalOpen(true)}
>
  Draft via Gmail
</button>
```

**File:** `app/src/components/MainDashboard/DraftEmailModal.tsx` (new)

Modal with three fields: `To` (pre-filled, read-only), `Subject` (editable),
`Body` (textarea, pre-filled from whichever sequence step or mockup intro the
user chose). Below the body, a select dropdown lets the user pick a draft
template / sequence step if there are any drafts attached to the prospect.

On submit:

1. Call `api.draftOutreachEmail({ to, subject, body })`.
2. On success:
   - Save the draft to disk:
     `vault/Outreach/<slug>/drafts/<ts>-<subject-slug>.md` with frontmatter
     `{to, subject, threadId, draftId, sentAt: null}`.
   - Append `threadId` to the prospect profile's `threadIds[]`.
   - Add the thread to `tracked_threads.json` (new Rust command — see
     Step 4).
   - Update prospect status to `sequence-sent`.
   - `logActivity({ type: "outreach.drafted", prospectSlug, summary, refPath })`.
   - Toast: "Draft created. Open Gmail to review and send →" with a link
     element to `https://mail.google.com/mail/u/0/#drafts`.
3. On failure: surface the error inline, leave the modal open.

**Verification:** click the button, fill in, submit. Toast appears. Gmail
drafts folder has the email. Disk has the draft markdown. Prospect status
is `sequence-sent`. `tracked_threads.json` has the new entry. Activity feed
shows the `outreach.drafted` event.

---

### Step 4 — Tracked threads file management

**File:** `app/src-tauri/src/tracked_threads.rs` (new)

```rust
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use chrono::Utc;

use crate::vault::vault_root;

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct TrackedThreadsFile {
    pub version: u32,
    pub threads: BTreeMap<String, TrackedThread>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TrackedThread {
    pub prospect_slug: String,
    pub created_at: String,
    pub last_checked_at: Option<String>,
}

fn path(root: &str) -> PathBuf {
    vault_root(root).join("ops").join("tracked_threads.json")
}

fn load(root: &str) -> Result<TrackedThreadsFile, String> {
    let p = path(root);
    if !p.exists() {
        return Ok(TrackedThreadsFile { version: 1, threads: BTreeMap::new() });
    }
    let raw = fs::read_to_string(&p).map_err(|e| format!("read tracked_threads: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("parse tracked_threads: {e}"))
}

fn save(root: &str, file: &TrackedThreadsFile) -> Result<(), String> {
    let p = path(root);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir ops: {e}"))?;
    }
    let s = serde_json::to_string_pretty(file).map_err(|e| format!("serialize: {e}"))?;
    fs::write(&p, s).map_err(|e| format!("write tracked_threads: {e}"))
}

#[tauri::command]
pub fn track_thread(root: String, thread_id: String, prospect_slug: String) -> Result<(), String> {
    let mut f = load(&root)?;
    f.threads.insert(
        thread_id,
        TrackedThread {
            prospect_slug,
            created_at: Utc::now().to_rfc3339(),
            last_checked_at: None,
        },
    );
    save(&root, &f)
}

#[tauri::command]
pub fn list_tracked_threads(root: String) -> Result<TrackedThreadsFile, String> {
    load(&root)
}

#[tauri::command]
pub fn update_thread_checked(root: String, thread_id: String) -> Result<(), String> {
    let mut f = load(&root)?;
    if let Some(t) = f.threads.get_mut(&thread_id) {
        t.last_checked_at = Some(Utc::now().to_rfc3339());
    }
    save(&root, &f)
}

#[tauri::command]
pub fn untrack_thread(root: String, thread_id: String) -> Result<(), String> {
    let mut f = load(&root)?;
    f.threads.remove(&thread_id);
    save(&root, &f)
}
```

Register in `lib.rs`. Expose all four through `api` in `tauri.ts`.

**Verification:** call `api.trackThread` and `api.listTrackedThreads` from
DevTools; confirm the file appears and reads back correctly.

---

### Step 5 — Reply poller (scheduled)

This is the most architecturally interesting step. The poller runs on a
schedule and writes files into the repo. **Pick one of two implementations
based on the Open Decisions (1):**

#### Option A — Claude `/schedule` (preferred if it has repo write access)

In the user's shell, set up a scheduled job:

```
/schedule create
```

When prompted for the prompt body, paste the contents of
`vault/ops/reply_poller_prompt.md` (new file — see below). Set the schedule
to every 15 minutes.

**File:** `vault/ops/reply_poller_prompt.md` (new)

```
You are the HML outreach reply poller. Run every 15 minutes.

Tools available: Read, Write, Edit, and the `mcp__claude_ai_Gmail__*` family.

Step 1. Read `vault/ops/tracked_threads.json`. If the file does not exist,
exit with summary: "No tracked threads."

Step 2. For each thread_id in `threads`:
  - Call `mcp__claude_ai_Gmail__get_thread` with the thread_id.
  - Find messages whose `date` is newer than that thread's `last_checked_at`
    (or all messages if `last_checked_at` is null).
  - Filter to messages where the sender is NOT contact.jakehauck@gmail.com.
    These are inbound replies.
  - If there are no inbound replies, skip this thread.
  - For each inbound reply:
    a. Write a markdown file to
       `vault/Outreach/<prospect_slug>/replies/<YYYY-MM-DD-HHMM>-<from-slug>.md`
       with frontmatter { from, subject, threadId, receivedAt } and body =
       a 2-sentence summary + a "Full text:" section with the verbatim
       message body.
    b. Detect hot signals — does the body contain any of: pric, cost, quote,
       interested, call, book, schedule, demo, available, "when can", "how
       soon"? (case-insensitive substring match). If yes, mark hot=true.
    c. Append a line to `vault/ops/activity.jsonl`:
       `{"ts":"<rfc3339>","type":"outreach.reply","prospectSlug":"<slug>","summary":"<2-sentence summary>","hot":<bool>,"refPath":"<the file you wrote>"}`
  - If the prospect's status (in `vault/Outreach/<slug>/profile.md`
    frontmatter) is `sequence-sent`, change it to `replied`.
  - Update that thread's `last_checked_at` in `vault/ops/tracked_threads.json`
    to the current UTC RFC3339 timestamp.

Step 3. Output a one-paragraph summary of what you did: how many threads
checked, how many new replies found, how many hot.

Never delete entries from tracked_threads.json. Never modify the version
field. Never write outside vault/Outreach/, vault/ops/activity.jsonl, or
vault/ops/tracked_threads.json.
```

**Verification:** with at least one prospect tracked (Step 3 done), run the
schedule manually once. Send yourself a reply from a different Gmail account
to that thread. Run again. Confirm:
- A file appears in `vault/Outreach/<slug>/replies/`.
- The prospect status is now `replied`.
- `activity.jsonl` has the new line.
- `tracked_threads.json` shows an updated `last_checked_at`.

#### Option B — Tauri-side interval (fallback if `/schedule` can't write to repo)

Add a `tokio::spawn` loop inside `lib.rs::run()` that ticks every 15 minutes
while the app is open and shells out to `claude -p` with the same prompt
above. The loop only runs while the app is open — that's an explicit
tradeoff documented to the user.

---

### Step 6 — Activity feed surfaces replies

This is mostly free given doc 03 — `outreach.reply` is already a registered
event type in `ActivityEventType`. Confirm:

- The dashboard "Recent activity" panel renders `outreach.reply` rows with
  the prospect chip and the amber "hot" pill when `hot: true`.
- Clicking a row opens the reply markdown file.
- The bell icon increments for hot replies even before the user opens the
  app.

---

### Step 7 — Prospect page reply view

**File:** `app/src/components/MainDashboard/OutreachProspectPage.tsx`

Add a "Replies" section below "Drafts" that lists files in
`vault/Outreach/<slug>/replies/`, newest first. Each row shows: timestamp,
sender, the 2-sentence summary, and an open-thread-in-Gmail link
(`https://mail.google.com/mail/u/0/#inbox/<threadId>`).

**Verification:** with a prospect that has at least one reply, the prospect
page shows it. Click the Gmail link, it opens the right thread.

---

## Testing plan

1. **Draft path end-to-end.** Pick (or create) a test prospect with your own
   personal Gmail as the email. Click "Draft via Gmail." Confirm the draft
   in Gmail, the prospect file updates, the activity feed shows it, and
   `tracked_threads.json` has the entry.
2. **Reply detection.** From the personal Gmail, reply to the draft (after
   sending it). Wait one poll cycle (or trigger manually). Confirm the
   reply file is written, status is `replied`, activity feed has the
   `outreach.reply` event.
3. **Hot detection.** Send a reply containing the word "interested" or
   "pricing." Confirm `hot: true` in the activity entry and the amber pill
   in the UI.
4. **Idempotency.** Run the poller twice in a row with no new replies.
   Confirm no duplicate files, no duplicate activity entries.
5. **Untracked thread.** Manually remove an entry from
   `tracked_threads.json`. Run the poller. Confirm it doesn't crash and
   doesn't re-add the entry.

---

## How to verify this shipped

- [ ] A prospect with an email field shows the "Draft via Gmail" button.
- [ ] Clicking the button creates a real Gmail draft, visible at
      mail.google.com/mail/u/0/#drafts.
- [ ] The prospect profile gains a `threadIds[]` entry.
- [ ] `vault/ops/tracked_threads.json` is updated.
- [ ] After sending and a reply arriving, the scheduled poller (or in-app
      interval) flips the status to `replied` within 15 min.
- [ ] Reply markdown files exist under `vault/Outreach/<slug>/replies/`.
- [ ] Activity feed shows draft, sent, and reply events with sensible
      summaries.
- [ ] Hot replies are visibly distinguished in both the feed and the bell
      popover.
- [ ] No need to copy-paste outreach emails ever again for the rest of your
      natural life.
