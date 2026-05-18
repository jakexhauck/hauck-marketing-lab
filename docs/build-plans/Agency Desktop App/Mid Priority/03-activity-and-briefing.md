# Activity log + Today briefing

> Status: Proposed. Ship the log first; the briefing reads from it.
> Effort: 2-3 hours for the log infra + half a day for memory write-back. 1-2 days for the briefing.
> Why this matters: The dashboard's "Recent activity" panel is a permanent empty state. Form runs are amnesiac across days. Both problems share one fix: write durable events to disk, read them back.
> Depends on: nothing (this is the substrate other docs build on).

## What this build replaces

Two earlier docs (now merged): the activity-log + memory write-back substrate and the morning ops briefing. Briefing is a thin reader on top of the log, so they belong together.

---

## Part 1, Activity log + Memory write-back (build first)

### Why this matters

Two compounding problems exist today:

1. **The dashboard's "Recent activity" panel is a permanent empty state.** It reads `<div className="hml-empty">No activity logged yet…</div>` because nothing writes activity anywhere. The user has no rear-view mirror.
2. **Every form run is amnesiac.** When Jake runs Vortex / Stratos / Nexus / Zenith for the same client across days or weeks, none of the durable facts produced by past runs make it into the prompt context for the next run.

Both have the same fix shape: write something durable to disk after every meaningful action, and read it back into the dashboard + future prompts.

Shipping this **first** matters because the outreach + scheduled-jobs doc wants to write into the activity log too. If this doesn't exist yet, that work invents its own ad-hoc log files and we have a mess.

### Decisions already made (do not relitigate)

- **One log file, not many.** `vault/ops/activity.jsonl` is a single newline-delimited JSON file. One file fits the volume (~50 events on a heavy day).
- **Append-only.** Never rewrite. Crash-safe. Editor-friendly.
- **JSON Lines, not regular JSON array.** Appends are O(1); survive partial writes.
- **Schema is flat and forgiving.** Required: `ts`, `type`, `summary`. Everything else optional.
- **Memory write-back is its own `claude -p` call after form save**, not baked into the form prompt. Form prompts are tuned for output quality; mixing extraction would degrade them.
- **Dashboard panel reads from disk on mount + on `data://changed` events.** No in-memory cache, no React state sync layer.
- **No deletion UI.** Delete the file by hand if needed.

### Open decisions

1. **Unread count semantics.** "Unread" = `ts` newer than a `lastSeenAt` stamp persisted in `vault/ops/activity_state.json`. Bell click writes a fresh `lastSeenAt`. Alternative (per-entry `seen: true`) means rewriting old entries. Default to `lastSeenAt` unless told otherwise.
2. **Memory write-back model.** Reuse `claude -p` (Max budget, marginal cost $0). Revisit if slow.
3. **Cap on log size.** ~10MB before performance becomes an issue (~50k entries). Add rotation later if needed.

### Out of scope

- Per-event reactions / threaded comments.
- Activity log inside the GitHub repo (it is, but no special handling).
- Search across entries (defer to future Cmd+K).
- Cross-machine real-time sync (GitHub sync handles eventually).
- Anything requiring a DB.

### Target architecture

```
vault/
  ops/
    activity.jsonl            <- new, append-only event log
    activity_state.json       <- new, holds lastSeenAt for unread counts
  Clients/<Client Name>/
    Memory.md                 <- existing, append-only facts
```

Flow:

```
[form save | scraper | mockup | outreach | reply]
    → api.appendActivity(event)         (TS helper)
    → Tauri cmd `append_activity`       (Rust)
    → vault/ops/activity.jsonl (one line appended)
    → emit data://changed { kind: "activity" }
    → Frontend dashboard panel re-tails last 20 entries
```

Memory write-back flow (form save only):

```
[form save completes successfully, client is known]
    → Spawn `claude -p` with focused extraction prompt on the saved output file path
    → Output is markdown bullets (or empty if no durable facts)
    → If non-empty: api.appendToMemory(root, clientSlug, bullets)
    → api.appendActivity({ type: "memory.updated", clientSlug, summary })
```

### Event schema (`app/src/lib/activity.ts`)

```ts
export type ActivityEventType =
  | "form.run"          // a GenericFormGenerator form completed
  | "scraper.run"       // lead-scraper produced new leads
  | "mockup.generated"  // web-designer wrote a new mockup
  | "outreach.drafted"  // Gmail draft created for a prospect
  | "outreach.sent"     // status moved to sequence-sent (after manual send)
  | "outreach.reply"    // reply detected by scheduled poller (hot or not)
  | "memory.updated"    // memory write-back appended facts
  | "client.added"
  | "scheduled.run";    // a scheduled agent finished a job

export interface ActivityEvent {
  /** ISO 8601 UTC. Set server-side in Rust if the caller omits it. */
  ts?: string;
  type: ActivityEventType;
  /** Required. One-liner shown in the feed. Keep under ~100 chars. */
  summary: string;
  /** Optional scoping. Either set if relevant, never both. */
  clientSlug?: string;
  prospectSlug?: string;
  /** Optional pointer to the file this event refers to. Relative to repo root. */
  refPath?: string;
  /** Optional flag for the bell icon, pings the user only if true. */
  hot?: boolean;
  /** Optional free-form metadata. Don't put PII here. */
  meta?: Record<string, string | number | boolean>;
}
```

Example lines in `activity.jsonl`:

```
{"ts":"2026-05-13T18:42:11Z","type":"form.run","clientSlug":"willis-windows","summary":"Generated 5 ad copy variants","refPath":"vault/Clients/Willis Windows/outputs/ad-copy/2026-05-13-variants.md"}
{"ts":"2026-05-13T18:45:02Z","type":"memory.updated","clientSlug":"willis-windows","summary":"Added 2 facts to Memory.md"}
{"ts":"2026-05-13T19:01:33Z","type":"outreach.drafted","prospectSlug":"acme-roofing","summary":"Drafted mockup intro email","refPath":"vault/Outreach/acme-roofing/drafts/2026-05-13-mockup-intro.md"}
{"ts":"2026-05-13T20:14:22Z","type":"outreach.reply","prospectSlug":"acme-roofing","summary":"Reply detected: pricing question","hot":true}
```

### Implementation steps

**Step 1, Rust module `ops_activity.rs`.** New file `app/src-tauri/src/ops_activity.rs`. Commands: `append_activity`, `tail_activity`, `read_activity_state`, `mark_activity_seen`. Key pattern is `OpenOptions::new().append(true).create(true)` for crash-safe appends and `emit_changed(&app, DataKind::Activity, ...)` for the frontend signal.

```rust
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use tauri::AppHandle;

use crate::events::{emit_changed, DataKind};
use crate::vault::vault_root;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ActivityEvent {
    pub ts: Option<String>,
    #[serde(rename = "type")]
    pub kind: String,
    pub summary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_slug: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prospect_slug: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ref_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hot: Option<bool>,
    #[serde(default, skip_serializing_if = "std::collections::BTreeMap::is_empty")]
    pub meta: std::collections::BTreeMap<String, serde_json::Value>,
}

fn log_path(root: &str) -> PathBuf {
    vault_root(root).join("ops").join("activity.jsonl")
}

#[tauri::command]
pub fn append_activity(
    app: AppHandle,
    root: String,
    event: ActivityEvent,
) -> Result<(), String> {
    let path = log_path(&root);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir ops: {e}"))?;
    }
    let mut ev = event;
    if ev.ts.is_none() {
        ev.ts = Some(Utc::now().to_rfc3339());
    }
    let line = serde_json::to_string(&ev).map_err(|e| format!("serialize: {e}"))?;
    let mut f = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("open log: {e}"))?;
    writeln!(f, "{line}").map_err(|e| format!("write log: {e}"))?;

    emit_changed(&app, DataKind::Activity, ev.client_slug.clone(), Some(
        path.to_string_lossy().to_string(),
    ));
    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ActivityTail {
    pub events: Vec<ActivityEvent>,
    pub total: usize,
}

#[tauri::command]
pub fn tail_activity(root: String, limit: usize) -> Result<ActivityTail, String> {
    let path = log_path(&root);
    if !path.exists() {
        return Ok(ActivityTail { events: vec![], total: 0 });
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read log: {e}"))?;
    let lines: Vec<&str> = raw.lines().filter(|l| !l.trim().is_empty()).collect();
    let total = lines.len();
    let start = total.saturating_sub(limit);
    let events: Vec<ActivityEvent> = lines[start..]
        .iter()
        .rev()
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect();
    Ok(ActivityTail { events, total })
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ActivityState {
    pub last_seen_at: Option<String>,
}

fn state_path(root: &str) -> PathBuf {
    vault_root(root).join("ops").join("activity_state.json")
}

#[tauri::command]
pub fn read_activity_state(root: String) -> Result<ActivityState, String> {
    let p = state_path(&root);
    if !p.exists() { return Ok(ActivityState::default()); }
    let raw = fs::read_to_string(&p).map_err(|e| format!("read state: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("parse state: {e}"))
}

#[tauri::command]
pub fn mark_activity_seen(root: String) -> Result<(), String> {
    let p = state_path(&root);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir ops: {e}"))?;
    }
    let state = ActivityState {
        last_seen_at: Some(Utc::now().to_rfc3339()),
    };
    let s = serde_json::to_string_pretty(&state).map_err(|e| format!("serialize: {e}"))?;
    fs::write(&p, s).map_err(|e| format!("write state: {e}"))
}
```

Add `Activity` variant to `DataKind` in `app/src-tauri/src/events.rs`. Register the four commands in `lib.rs`.

**Step 2, TS bindings.** In `app/src/lib/tauri.ts`:

```ts
appendActivity: (root: string, event: ActivityEvent) =>
  invoke<void>("append_activity", { root, event }),
tailActivity: (root: string, limit: number) =>
  invoke<ActivityTail>("tail_activity", { root, limit }),
readActivityState: (root: string) =>
  invoke<ActivityState>("read_activity_state", { root }),
markActivitySeen: (root: string) =>
  invoke<void>("mark_activity_seen", { root }),
```

New file `app/src/lib/activity.ts` holds the types plus a wrapper that swallows errors:

```ts
export async function logActivity(
  root: string | null,
  event: ActivityEvent,
): Promise<void> {
  if (!root) return;
  try {
    await api.appendActivity(root, event);
  } catch (e) {
    console.warn("activity log failed:", e);
  }
}
```

**Step 3, Rewrite the dashboard's "Recent activity" panel.** In `app/src/components/MainDashboard/index.tsx`, replace the empty-state with `<ActivityFeedPanel root={root} />`. On mount + on `data://changed` where `kind === "activity"`, call `api.tailActivity(root, 20)`. Each row: dot color by type, summary + relative time, client/prospect chip if present, amber "hot" pill if `hot`. Click row opens `refPath` via the existing Tauri opener. Empty state keeps the existing copy verbatim.

**Step 4, Wire activity calls into existing surfaces.**

- `GenericFormGenerator.tsx` (line ~269), `TrackingAuditWalkthrough.tsx` (~231), `WorkflowChain.tsx` (~248): `type: "form.run"`.
  ```ts
  await logActivity(root, {
    type: "form.run",
    summary: `${formConfig.savedHeading.replace(/ saved$/, "")} — ${output.title}`,
    clientSlug,
    refPath: output.path,
  });
  ```
- `LeadScraperPage.tsx`: `type: "scraper.run"`.
  ```ts
  await logActivity(root, {
    type: "scraper.run",
    summary: `Scraped ${result.leadCount} leads (${niche} · ${city})`,
  });
  ```
- `WebDesignerPage.tsx`: `type: "mockup.generated"`.
  ```ts
  await logActivity(root, {
    type: "mockup.generated",
    summary: `Mockup generated for ${clientName}`,
    clientSlug,
    refPath: relativeMockupPath,
  });
  ```

**Step 5, Memory write-back.** New `app/src/lib/memoryWriteback.ts`. After form save + activity log:

```ts
void writeBackMemory({
  root,
  clientSlug,
  clientName,
  outputPath: output.path,
  formTitle: formConfig.title,
});
```

The helper calls `claude -p` with an extraction prompt that returns markdown bullets or `NONE`. If non-empty, appends to Memory.md under a dated section header and logs a `memory.updated` activity event.

Extraction prompt:

```
You are reading a freshly-saved marketing-ops form output for a single client.

Extract 1-3 DURABLE FACTS about this specific client that should persist in their long-term Memory.md. A durable fact is something that would still be true and useful in 3 months: preferences, constraints, decisions made, results observed, audience or product specifics.

Do NOT extract:
- Generic marketing knowledge.
- The fact that the form was run, or when.
- The output itself.
- Anything obvious from the client's Profile.md.

Output ONLY a markdown bulleted list. Each bullet must stand alone (no pronouns referencing prior bullets). If there are no durable facts, output the single word: NONE.
```

**Step 6, Bell icon.** Replace the existing bell button with `<NotificationsBell root={root} />`:
- On mount: `tailActivity(root, 50)` + `readActivityState(root)`.
- Unread = entries with `ts > lastSeenAt`. If `lastSeenAt` null, unread = `hot: true` only (no "47 unread" on fresh start).
- Badge over the bell when unread > 0.
- Click opens popover with last 10 entries, `hot` ones get amber pill. Close calls `api.markActivitySeen(root)` to reset.

### Testing plan

Manual smoke tests after each step. The codebase has no Jest/Vitest suite for the Tauri side; don't introduce one for this work.

End-to-end smoke after the whole block lands:
1. Start the app fresh.
2. Run an Ad Copy form for Willis Windows.
3. Within 30 seconds: dashboard shows `form.run`; within ~10 more seconds, `memory.updated` appears; `vault/Clients/Willis Windows/Memory.md` has new dated content.
4. Run lead scraper. Feed shows `scraper.run`.
5. Manually inject `{ type: "outreach.reply", summary: "test", hot: true }` via DevTools. Bell shows `1`. Click bell, see entry.
6. Reload. Feed persists. Bell badge persists (unless marked seen).

### Verification checklist

- [ ] `vault/ops/activity.jsonl` exists with ≥5 entries after a day of normal use.
- [ ] `vault/Clients/Willis Windows/Memory.md` shows new dated sections from write-back.
- [ ] Bell icon has a working unread badge.
- [ ] Dashboard "Recent activity" panel is no longer permanent-empty.
- [ ] No `console.warn` spam from `logActivity` during normal use.
- [ ] Every `appendActivity` call site is wrapped in `logActivity` (the wrapper handles null-root + try/catch).

---

## Part 2, Today briefing (build second)

### Why this matters

Most agencies don't fail at scale because their work gets worse. They fail because attention fragments and individual balls drop silently: a creative awaiting approval for 5 days, a CPL that drifted 30% over target, an outreach reply nobody answered.

The OS already has every input. It does not currently aggregate them.

### What we have today

- `OpsTrackers.tsx`: per-client trackers, no cross-client summary view.
- `ClientDashboard.tsx`: per-client overview, requires clicking into each client.
- `vault/Clients/<name>/Memory.md` and (after Part 1 ships) `activity.jsonl`.
- `onboardingPlan.ts`: phase + day numbers per task per client.
- After Meta Ads doc ships: live CPL per client cached.

### What "done" looks like

A single page (top-level "Today" tab, first item under Workspace) that shows across **all active clients**:

1. **Inbox needing reply.** Outreach replies + client emails awaiting response > 24h. Source: reply classifier (post-Outreach + Jobs doc), or Gmail MCP search until then.
2. **CPL drift alerts.** Any client whose 7-day-rolling CPL is >20% above target (from `Profile.md` benchmarks). One row per breach: client, current CPL, target, delta, since when.
3. **Creative awaiting approval >48h.** Any saved-output flagged for client review without an "approved" entry in activity log.
4. **Onboarding slippage.** Any task in `onboardingPlan.ts` past its phase-day for a client without a checked-off date.
5. **Yesterday's wins.** Counter: `12 leads · 3 form runs · 1 creative shipped · 18 outreach sent · 2 replies`.

Each row deep-links into the relevant client surface.

### Build steps

1. **Aggregator module (`app/src/lib/briefing.ts`).** Pure function: takes (clients, activity log, integrations.json, onboarding plan) → returns typed `BriefingPayload`. No I/O inside the function. Easier to test.
2. **Data sources.** `vault/Clients/*/Memory.md`, `vault/Clients/*/activity.log` (per Part 1), `vault/Clients/*/Profile.md` (CPL target + AOV), Gmail MCP via `claude -p` for inbox counts.
3. **Page (`app/src/components/MainDashboard/MorningBriefing.tsx`).** Five collapsed sections, each with a count badge. Click expands rows. Empty state per section: `▸ all clear`. Refresh button + auto-refresh on focus.
4. **Wiring.** Add `Today` as the first sidebar item under Workspace. Optionally make it the default landing surface on app open (configurable).
5. **Push (phase 2).** Tauri's `notification` plugin. Fire system notification on state transitions (green → red) only; not on every drift.

### Recommendation: pull live, do not pre-build

A 7am scheduled job pre-computing into `vault/briefing/YYYY-MM-DD.md` is more complex with no real win. Live pull on app open is simpler, never stale, only marginally slower (most data is local files). Revisit if it gets slow at 15+ clients.

### Open decisions

- **CPL drift threshold.** Default 20% above target. Per-client override via `Profile.md`. Confirm.
- **Approval staleness.** Default 48h. Could be 72h or per-niche. Confirm.
- **Replace MainDashboard or sit beside it?** Recommend sit-beside as "Today". MainDashboard stays for the OS feel. Confirm.

### Out of scope

- Notifications via SMS / email / Slack. System notifications only.
- Action-taking from the briefing ("pause this ad" button). Read-only.
- Historical briefings / trend view. Today only.

### Effort + leverage

- Activity log + memory write-back: 2-3 hours + half a day for write-back wiring.
- Briefing: 1-2 days.
- Matters more at 8 clients than at 3. Build now so it's there when scaling.
