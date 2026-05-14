# 03 — Activity Log + Memory Write-back

> **Status:** Designed in detail, ready to implement.
> **Effort:** 2-3 hours for the full block.
> **Build order:** Ship this **first**. Everything else (02, 04) writes into it.

---

## Why this matters

Two compounding problems exist today:

1. **The dashboard's "Recent activity" panel is a permanent empty state.** It
   reads `<div className="hml-empty">No activity logged yet…</div>` because
   nothing writes activity anywhere. The user has no rear-view mirror.
2. **Every form run is amnesiac.** When Jake runs Vortex / Stratos / Nexus /
   Zenith for the same client across days or weeks, none of the durable facts
   produced by past runs make it into the prompt context for the next run. The
   system never gets smarter for a specific client.

Both have the same fix shape: write something durable to disk after every
meaningful action, and read it back into the dashboard + future prompts.

Shipping this **first** matters because Options 02 (outreach) and 04
(scheduled agents) both want to write into the activity log. If 03 doesn't
exist yet, they invent their own ad-hoc log files and we have a mess.

---

## Background a new terminal needs

You are working in the HML (Hauck Marketing Lab) Tauri desktop app at
`C:\Users\games\Desktop\hauck-marketing-lab\`. The app is a Rust backend +
React/TypeScript frontend that wraps a folder-based agent system. There is no
database. Files are the source of truth.

Key file roots:

- `app/src-tauri/src/` — Rust backend (Tauri commands).
- `app/src/` — React frontend.
- `vault/` — Obsidian-compatible vault holding About notes, per-client
  Profile/Memory, knowledge frameworks. This is where agent memory lives.
- `vault/Clients/<Client Name>/` — per-client folder. Inside:
  `Profile.md`, `Memory.md` (append-only), `outputs/`.
- `vault/ops/` — operational state files like `tasks.json`. **This is where the
  activity log will live.**
- `media-buying/` — the underlying agent + skill + knowledge folder system.

Existing patterns you must follow:

- Every Rust file in `app/src-tauri/src/` exposes a handful of
  `#[tauri::command]` functions. New modules are registered in two places:
  `app/src-tauri/src/lib.rs` (module declaration + `invoke_handler!`).
- TypeScript bindings live in `app/src/lib/tauri.ts` under the `api` object.
- The `crate::events::emit_changed(app, DataKind::X, client_slug, path)`
  helper emits a `data://changed` event that the frontend listens to for live
  refresh. Use it.
- Read `app/src-tauri/src/generators.rs` and `app/src-tauri/src/vault.rs`
  before writing the new module — they are the closest pattern matches.

Existing TS api calls that are relevant to wire into:

- `api.saveGeneratorOutput(args)` — called by all form generators when they
  save output (`app/src/components/GenericFormGenerator.tsx:269`, also
  TrackingAuditWalkthrough, WorkflowChain).
- `api.appendToMemory(root, clientSlug, fact)` — already exists, used by
  ChatDrawer. Memory write-back will reuse it.
- `api.runLeadScraper(...)` — lead scraper run.
- `api.runWebDesigner(...)` — mockup generation.

---

## Decisions already made (do not relitigate)

- **One log file, not many.** `vault/ops/activity.jsonl` is a single
  newline-delimited JSON file. One file is simpler than per-day rotations and
  fits the volume (a heavy day is ~50 events).
- **Append-only.** Never rewrite the file. Crash-safe. Editor-friendly.
- **JSON Lines, not regular JSON array.** A regular JSON array means every
  append has to rewrite the whole file. JSONL appends are O(1) and survive
  partial writes.
- **Schema is flat and forgiving.** Required: `ts`, `type`, `summary`.
  Everything else is optional. The dashboard panel renders what it has and
  ignores the rest.
- **Memory write-back is its own `claude -p` call after the form save**, not
  baked into the form prompt. Reason: the form prompt is already tuned for
  output quality; mixing in a "and also extract memorable facts" instruction
  would degrade the primary output. One short follow-up call is cheaper than
  re-tuning every form.
- **The "Recent activity" panel reads from disk on mount and on
  `data://changed` events.** No in-memory cache, no React state sync layer.
- **No deletion UI.** If you want to clean the log, delete the file by hand.
  Future activity will create a fresh one.

---

## Open decisions (confirm before coding)

1. **Unread count semantics.** The bell icon will eventually show an unread
   count. Define "unread" as "ts newer than a `lastSeenAt` stamp persisted in
   `vault/ops/activity_state.json`." Bell click writes a fresh `lastSeenAt`.
   Confirm with Jake before implementing — alternative is per-entry
   `seen: true` flags, which means rewriting old entries. Default to
   `lastSeenAt` unless told otherwise.
2. **Memory write-back model.** The follow-up extraction call could use
   `claude -p` (same Max budget as the form) or a cheap dedicated model. For
   v1, reuse `claude -p` — keeps marginal cost at $0 and simplifies the call
   site. Revisit if it becomes slow.
3. **Cap on activity log size.** Pragmatically, ~10MB before performance
   becomes an issue (~50k entries). Add a rotation later if needed; don't
   build it now.

---

## Out of scope

- Per-event reactions / threaded comments on activity entries.
- Activity log inside the GitHub repo (it is — but no special handling).
- Search across activity entries (defer to the future Cmd+K work).
- Cross-machine "real-time" sync of activity (GitHub sync handles it
  eventually; that's fine).
- Anything that requires a DB.

---

## Target architecture

```
vault/
  ops/
    activity.jsonl            <- new, append-only event log
    activity_state.json       <- new, holds lastSeenAt for unread counts
  Clients/
    <Client Name>/
      Memory.md               <- existing, append-only facts
```

Flow:

```
[form save | scraper run | mockup gen | outreach draft | reply received]
              |
              v
      api.appendActivity(event)         (TS helper)
              |
              v
      Tauri cmd `append_activity`       (Rust)
              |
              v
      vault/ops/activity.jsonl (one line appended)
              |
              v
      emit data://changed { kind: "activity" }
              |
              v
      Frontend dashboard panel re-tails last 20 entries
```

Memory write-back flow (form save only):

```
[form save completes successfully, client is known]
              |
              v
      Spawn `claude -p` with a focused extraction prompt
        on the just-saved output file path
              |
              v
      Output is markdown bullets (or empty if no durable facts)
              |
              v
      If non-empty: api.appendToMemory(root, clientSlug, bullets)
              |
              v
      api.appendActivity({ type: "memory.updated", clientSlug, summary })
```

---

## Event schema

A single TypeScript type lives in `app/src/lib/activity.ts` (new file). The
Rust struct mirrors it.

```ts
export type ActivityEventType =
  | "form.run"          // a GenericFormGenerator form completed
  | "scraper.run"       // lead-scraper produced new leads
  | "mockup.generated"  // web-designer wrote a new mockup
  | "outreach.drafted"  // Gmail draft created for a prospect
  | "outreach.sent"     // prospect status moved to sequence-sent (after manual send)
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
  /** Optional scoping. Either set if relevant — never both. */
  clientSlug?: string;
  prospectSlug?: string;
  /** Optional pointer to the file this event refers to. Relative to repo root
   *  so the frontend can build an Obsidian/Finder link. */
  refPath?: string;
  /** Optional flag for the bell icon — pings the user only if true. */
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

---

## Implementation plan

### Step 1 — Create the Rust module `ops_activity.rs`

**File:** `app/src-tauri/src/ops_activity.rs` (new)

Contents (sketch — fill in the obvious imports):

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

    // Emit a custom DataKind so the frontend can listen.
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

// activity_state.json holds lastSeenAt
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

**Add a new variant to `DataKind`** in `app/src-tauri/src/events.rs`:

```rust
pub enum DataKind {
    // ...existing variants...
    Activity,
}
```

**Register the module** in `app/src-tauri/src/lib.rs`:

- Add `mod ops_activity;` near the top (alphabetical, after `ops;`).
- In `tauri::generate_handler![]` add:
  - `ops_activity::append_activity,`
  - `ops_activity::tail_activity,`
  - `ops_activity::read_activity_state,`
  - `ops_activity::mark_activity_seen,`

**Verification:** `cargo check` from `app/src-tauri/` passes. `npm run tauri dev`
boots without panic. Manually call `api.appendActivity(...)` from the
DevTools console and confirm a line appears in `vault/ops/activity.jsonl`.

---

### Step 2 — Wire TS bindings

**File:** `app/src/lib/tauri.ts` (edit)

Add to the `api` object:

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

**File:** `app/src/lib/activity.ts` (new)

Hold the `ActivityEventType`, `ActivityEvent`, `ActivityTail`, `ActivityState`
types shown above, plus a thin helper:

```ts
export async function logActivity(
  root: string | null,
  event: ActivityEvent,
): Promise<void> {
  if (!root) return; // app started without a folder picked — silently no-op
  try {
    await api.appendActivity(root, event);
  } catch (e) {
    console.warn("activity log failed:", e);
  }
}
```

**Verification:** type-check passes (`npm run typecheck` or whatever the
project's check command is — see `package.json`). The `api.appendActivity`
call from the DevTools console now works through the typed binding.

---

### Step 3 — Rewrite the dashboard's "Recent activity" panel

**File:** `app/src/components/MainDashboard/index.tsx`

Find the panel currently rendering:

```tsx
<div className="hml-empty">
  <div className="hml-empty-title">No activity logged yet</div>
  <div className="hml-empty-sub">
    Run a form, generate a website, or scrape leads — the feed
    fills as you work.
  </div>
</div>
```

Replace with a new component `<ActivityFeedPanel root={root} />` declared in
the same file (or extracted to
`app/src/components/MainDashboard/ActivityFeedPanel.tsx` — extract if it grows
past ~80 lines).

Behavior:

- On mount and on `data://changed` events where `kind === "activity"`, call
  `api.tailActivity(root, 20)`.
- Render each entry as a row:
  - left: a small dot color-coded by `type` (use existing palette tokens from
    `main-dashboard.css` — no new colors).
  - middle: `summary`; below it a meta line with relative time (`5m ago`,
    `2h ago`, `Yesterday`) + client/prospect chip if present.
  - right (only if `hot`): a tiny "hot" pill using the amber token.
- If `refPath` is set, click row opens the file via
  `await invoke("open_path", { path })` — there's an existing
  `tauri_plugin_opener` plugin, use it via `invoke`. If no Tauri opener
  command exists yet, just no-op the click for now (Step 3 is feed-only;
  click-to-open can wait).
- Empty state: keep the existing copy verbatim. The feed reverts to it when
  `tailActivity` returns zero entries.

**File:** `app/src/lib/tauri.ts`

If `eventsOn` isn't already exposed for the `data://changed` channel, add a
helper `onDataChanged(handler)` that wraps `appWindow.listen("data://changed",
...)`. Search the codebase first — `app/src/lib/googleCalendar.ts` already
exports `eventsOn`; if that's a generic helper, reuse it.

**Verification:** open the app on the dashboard with no events yet, see the
empty state. From the DevTools console run:

```js
await window.__TAURI__.invoke("append_activity", {
  root: "<paste root>",
  event: { type: "form.run", summary: "Test entry", clientSlug: "willis-windows" },
});
```

The feed updates within a second (event-driven, no polling).

---

### Step 4 — Wire activity calls into existing surfaces

For each surface, find the success path of the existing action and add one
line:

#### 4a. Form runs

**File:** `app/src/components/GenericFormGenerator.tsx` around line 269 where
`api.saveGeneratorOutput` returns.

```ts
await logActivity(root, {
  type: "form.run",
  summary: `${formConfig.savedHeading.replace(/ saved$/, "")} — ${output.title}`,
  clientSlug,
  refPath: output.path,
});
```

Use the actual variable names visible in that file. The summary should be
short, like `"Ad copy variants — Willis fall promo"` not the whole title.

Repeat the same wiring in:
- `app/src/components/TrackingAuditWalkthrough.tsx` around line 231.
- `app/src/components/WorkflowChain.tsx` around line 248.

#### 4b. Lead scraper

**File:** `app/src/components/MainDashboard/LeadScraperPage.tsx`

After a successful scrape run, log:

```ts
await logActivity(root, {
  type: "scraper.run",
  summary: `Scraped ${result.leadCount} leads (${niche} · ${city})`,
});
```

#### 4c. Web designer

**File:** `app/src/components/MainDashboard/WebDesignerPage.tsx`

After a mockup save:

```ts
await logActivity(root, {
  type: "mockup.generated",
  summary: `Mockup generated for ${clientName}`,
  clientSlug,
  refPath: relativeMockupPath,
});
```

**Verification:** run each of these surfaces; confirm one entry per action
appears in `activity.jsonl` and the feed.

---

### Step 5 — Memory write-back hook

**File:** `app/src/components/GenericFormGenerator.tsx`

After `await api.saveGeneratorOutput(...)` and after `await logActivity(...)`
in step 4a, add a non-blocking call to a new helper:

```ts
// Don't await — runs in background. If it fails, ignore.
void writeBackMemory({
  root,
  clientSlug,
  clientName,
  outputPath: output.path,
  formTitle: formConfig.title,
});
```

**File:** `app/src/lib/memoryWriteback.ts` (new)

```ts
import { api } from "./tauri";
import { logActivity } from "./activity";

interface Args {
  root: string | null;
  clientSlug: string;
  clientName: string;
  outputPath: string;
  formTitle: string;
}

const EXTRACTION_PROMPT = `You are reading a freshly-saved marketing-ops form output for a single client.

Extract 1-3 DURABLE FACTS about this specific client that should persist in their long-term Memory.md. A durable fact is something that would still be true and useful in 3 months — preferences, constraints, decisions made, results observed, audience or product specifics.

Do NOT extract:
- Generic marketing knowledge.
- The fact that the form was run, or when.
- The output itself.
- Anything obvious from the client's Profile.md.

Output ONLY a markdown bulleted list. Each bullet must stand alone (no pronouns referencing prior bullets). If there are no durable facts, output the single word: NONE.`;

export async function writeBackMemory(args: Args): Promise<void> {
  if (!args.root) return;
  try {
    const fullPrompt = [
      EXTRACTION_PROMPT,
      `\nClient: ${args.clientName} (${args.clientSlug})`,
      `Form: ${args.formTitle}`,
      `Output file path: ${args.outputPath}`,
      `\nRead that file and extract durable facts now.`,
    ].join("\n");
    const result = await api.invokeClaude({
      prompt: fullPrompt,
      // Reuse whatever options invokeClaude already accepts.
    });
    const text = (result?.text ?? "").trim();
    if (!text || text === "NONE") return;
    const stamped = `\n### ${new Date().toISOString().slice(0, 10)} — ${args.formTitle}\n${text}\n`;
    await api.appendToMemory(args.root, args.clientSlug, stamped);
    await logActivity(args.root, {
      type: "memory.updated",
      summary: `Memory updated from ${args.formTitle}`,
      clientSlug: args.clientSlug,
    });
  } catch (err) {
    console.warn("memory writeback failed:", err);
  }
}
```

Notes:

- Look at the existing `api.invokeClaude` signature in `app/src/lib/tauri.ts`
  and `app/src-tauri/src/claude.rs` — it may take an object with `messages`
  not `prompt`. Adjust the call accordingly.
- The `claude -p` subprocess must have read access to the output file path.
  That's a given since the file was just written next to the vault, but if
  the subprocess sandbox blocks it, switch to passing the file contents
  inline via the prompt instead of by path.

**Verification:** run any form for Willis Windows. Wait ~10 seconds after the
form returns. Open `vault/Clients/Willis Windows/Memory.md` — there should be
a new dated section with 1-3 bullets (or nothing, if the model returned
`NONE`). The activity feed should show a `memory.updated` entry.

---

### Step 6 — Bell icon (notifications)

**File:** `app/src/components/MainDashboard/index.tsx`

Find the bell button:

```tsx
<button type="button" className="hml-icon-btn" title="Notifications">
  <IconBell size={15} />
</button>
```

Replace with a small `<NotificationsBell root={root} />` component that:

- On mount, fetches `tailActivity(root, 50)` and `readActivityState(root)`.
- Computes unread count = entries with `ts > lastSeenAt`. If `lastSeenAt` is
  null, unread = all entries with `hot: true` only (a fresh user shouldn't
  see a "47 unread" badge on first run).
- Renders a small numeric badge over the bell when unread > 0.
- On click, opens a popover panel (use the existing
  `app/src/components/...` popover pattern if one exists; otherwise a simple
  absolutely-positioned `<div>` is fine — match the dashboard panel chrome
  in `main-dashboard.css`).
- The popover lists the last 10 entries, marks `hot` ones with the amber
  pill, and on close calls `api.markActivitySeen(root)` to reset the unread
  count.

**Verification:** log a `hot: true` event manually. Bell shows `1`. Click
bell, see the entry. Close popover. Bell clears.

---

## Testing plan

Manual smoke tests after each step. The codebase has no Jest/Vitest suite for
the Tauri side (verified by inspection), so don't introduce one for this work.

End-to-end smoke after the whole block lands:

1. Start the app fresh.
2. Run an Ad Copy form for Willis Windows.
3. Within 30 seconds:
   - Dashboard "Recent activity" shows `form.run` for that ad copy run.
   - Within ~10 more seconds (memory writeback latency), a
     `memory.updated` entry appears.
   - `vault/Clients/Willis Windows/Memory.md` has new content with today's
     date.
4. Run lead scraper. Activity feed shows `scraper.run`.
5. Manually inject `{ type: "outreach.reply", summary: "test", hot: true }`
   via DevTools. Bell icon shows `1`. Click bell, see the entry.
6. Reload the app. Feed persists. Bell badge persists (unless you marked
   seen).

---

## How to verify this shipped

- [ ] `vault/ops/activity.jsonl` exists and has at least 5 entries after a
      day of normal use.
- [ ] `vault/Clients/Willis Windows/Memory.md` shows new dated sections from
      memory write-back.
- [ ] Bell icon has a working unread badge.
- [ ] Dashboard "Recent activity" panel is no longer an empty state under
      any active workflow.
- [ ] No `console.warn` spam from `logActivity` failures during normal use.
- [ ] Code review: every `appendActivity` call site is wrapped in
      `logActivity` (not raw `api.appendActivity`) — the wrapper handles the
      null-root and try/catch.
