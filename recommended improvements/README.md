# Recommended Improvements — Hauck Marketing Lab

This folder is a set of handoff briefs for the four highest-leverage next moves on
the HML desktop app. Each file is written so a fresh Claude Code terminal (or a
human engineer) can pick it up cold and ship it without needing the original
conversation that produced it.

## How to use these docs

1. **Pick a file.** Each one is independent enough to ship on its own.
2. **Read the whole thing once** before touching code. They are deliberately
   detailed — skipping the "Background" or "Decisions already made" sections is
   how you end up relitigating things Jake already decided.
3. **Respect the "Out of scope" section.** These docs were scoped to land the
   value without sprawl. Adding adjacent improvements turns a one-day build
   into a one-week build.
4. **Flag open decisions before coding them.** Each file has an "Open decisions"
   section. Confirm with Jake before assuming a default.

## Order of operations

There is a real dependency chain. Recommended order:

1. **03 — Activity Log + Memory Write-back.** Foundation everything else writes
   into. Smallest unit of value, ~2-3 hrs.
2. **02 — Outreach Send + Reply Tracking.** Writes into the activity log. The
   single biggest customer-acquisition lever on the list, ~1-2 days.
3. **04 — Scheduled Agents.** Wraps both of the above in a "while you sleep"
   layer. Depends on 02 + 03 existing so the scheduled jobs have files to
   update, ~half a day.
4. **01 — Close the Data Loop (Meta + Google Ads APIs).** Largest scope, most
   external surface area. Unblocks Zenith reports and live anomaly alerts.
   ~2-3 days for read-only MVP.

## Universal constraints (apply to all four)

These come from `CLAUDE.md`, the foundation memo, and prior decisions Jake made.
They are not up for debate inside these briefs.

- **No DB, no cloud, no auth.** Folder-as-database. New state lives as files
  inside `vault/` or `media-buying/`.
- **LLM is `claude -p` shelled out as a subprocess.** No BYOK API keys, no
  Ollama, no OpenAI fallback. Jake's Claude Max absorbs the cost.
- **Cross-machine sync is at the OS level** — the private GitHub repo
  `jakexhauck/hauck-marketing-lab` handles Windows ↔ Mac. App stays
  sync-agnostic.
- **No emojis in code or UI** unless Jake explicitly asks. No italic serif on
  primary headlines (he calls it "cursive"). Sans-serif at 500-600 weight for
  display type.
- **`claude.ai Gmail` and `claude.ai Google Drive` MCPs are installed globally**
  and inherited by `claude -p` subprocesses. Gmail MCP supports drafts + read
  but **not** programmatic send (by design — Anthropic gates send behind a
  human click). Do not propose Composio for sending unless Jake explicitly asks
  for true one-click auto-send.
- **Be terse in UI copy.** No marketing prose. Functional labels only.

## File index

| # | File | Status | Effort |
|---|---|---|---|
| 01 | [01-close-the-data-loop.md](01-close-the-data-loop.md) | Proposed, largest scope | 2-3 days |
| 02 | [02-outreach-send-and-reply-tracking.md](02-outreach-send-and-reply-tracking.md) | Designed in detail | 1-2 days |
| 03 | [03-activity-log-and-memory-writeback.md](03-activity-log-and-memory-writeback.md) | Designed in detail | 2-3 hrs |
| 04 | [04-scheduled-agents.md](04-scheduled-agents.md) | Proposed, depends on 02+03 | ~half day |

Written 2026-05-13 by the planning session that scoped these items.
