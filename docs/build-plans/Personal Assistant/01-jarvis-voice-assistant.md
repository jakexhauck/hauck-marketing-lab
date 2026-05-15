# 01 — Jarvis: Voice-First Personal Assistant

> Build a voice-driven Claude assistant that lives on Jake's Windows desktop, captures voice memos straight into the vault, and grows into an always-on second brain across business and personal life.

## The vision

A Jarvis-style assistant Jake can talk to in his headphones. Hit a hotkey, talk, get a spoken response and/or actions taken on his computer. Starts as a voice-to-vault capture tool, grows into the central interface for running the agency, learning faster, and managing the day.

Not movie-Jarvis instant. Realistic latency: 2-8 seconds round trip. Worth it for the leverage.

## Why now

Every other build plan in this repo (Meta Ads MCP, auto reports, morning briefing, activity log) ships value through the same surface area: voice in, voice out, Claude doing the work in between. Build the rails once, every future capability rides them.

## The v1 build (ship in one evening)

**Goal:** Jake hits a hotkey, talks, Claude updates the vault.

**Stack:**
1. **Global hotkey** (e.g. `Ctrl+Alt+Space`) starts/stops recording. Library: `pynput` or `keyboard`
2. **Mic capture** via `sounddevice`
3. **Speech to text:** OpenAI Whisper API (~$0.006/min). Local `whisper.cpp` as offline fallback later
4. **Brain:** Subprocess call to `claude -p` with the transcript and a system prompt that says "process this brain dump, figure out which vault files to update, make the edits." Claude Code already knows the vault structure via CLAUDE.md and prompt.ts
5. **Voice back:** OpenAI TTS (cheaper) or ElevenLabs (better voice, ~$5-22/mo). Speaks the confirmation in headphones

**Why this architecture is right for Jake:**
- Reuses the vault, Claude Code, and prompt.ts infrastructure already built
- No new database, no new app, no new sync layer
- Hotkey matches stated friction tolerance (low, not zero)
- Solves the #1 stated job (voice → vault capture) directly
- Every future intent (ad queries, briefings, tutoring) plugs into the same daemon

**Location:** `tools/jarvis/` in this repo. Python daemon, ~200 lines.

**Time to working v1:** 3-4 hours.

## 30 / 60 / 90 day roadmap

**Days 1-7 — v1 ships**
Voice → vault. Just that. Daily use to surface what breaks.

**Days 8-30 — v1.5: two more intents on the same pipeline**
- "What's [client] doing?" → reads vault + ad data, speaks summary
- "Remind me what we decided about X" → vault search + speak

**Days 31-60 — v2: morning briefing**
Same stack, runs on a schedule at 7am, reads aloud while Jake makes coffee. Wires in Gmail MCP and (when it ships) Meta Ads MCP from build plan #1.

**Days 61-90 — v3: ambient capture**
Replace hotkey with wake word via Picovoice Porcupine (free tier). Optional: bolt on Anthropic Computer Use API for "open this client's GHL" type commands.

**Beyond 90: the always-on second brain**
Single agent ingests calendar, email, Slack, GHL, ad metrics, voice memos, browser history, vault. Two jobs:
1. Answer anything Jake asks about his own life and business
2. Proactively surface patterns and dropped balls he didn't ask about

## The full use-case landscape (for reference)

### Business / agency
- **Voice → vault capture (v1)** — drive home from a meeting, talk for 5 min, structured notes land in `vault/Clients/<Name>/Memory.md`
- **Ad ops voice queries** — "How's [client] tracking this week?" pulls Meta Ads data, speaks the answer
- **Inbox triage** — Claude reads Gmail every morning, surfaces what needs Jake, drafts replies (Gmail MCP supports drafts already)
- **Live ad copy on the go** — "Write me 5 hooks for the chiropractor offer" while walking. Already works on the Claude phone app today
- **Call transcription + follow-up** — record sales/client calls, Claude writes the recap email and updates GHL

### Personal productivity
- **Morning briefing** — calendar + inbox + ad anomalies + dropped balls, read aloud
- **Capture everything** — random thoughts → voice memos folder → Claude processes nightly into vault and tasks
- **Calendar agent** — "Move my 3pm tomorrow, find a 90-min focus block this week"
- **Read-it-to-me** — long articles, PDFs, contracts. Summary first, full read on request

### Learning (the underrated lane)
- **Socratic tutor** — pick a topic (media buying, copywriting, finance), Claude quizzes daily, tracks gaps. 15 min/day = real expertise in 6 months
- **YouTube companion** — pause a tutorial, ask "explain that part again", "how does this apply to my chiro client?"
- **Spaced repetition for ad knowledge** — Claude builds flashcards from every ad Jake studies, quizzes weekly

### Mobile (mostly works today)
- Claude iOS/Android app has solid voice mode. Free
- iOS Shortcuts → "Hey Siri, ask Claude" → opens straight to voice
- Voice memos to a Telegram/WhatsApp bot, Claude processes them into vault overnight

## Honest caveats

- **Latency:** voice → STT → Claude → action → TTS = 3-8 seconds even when nothing goes wrong. Not movie-instant
- **Cost:** Whisper is cheap (~$0.006/min). Claude Opus calls add up if used heavily. ElevenLabs ~$5-22/mo. Computer Use (later) is ~$0.30-1.00 per multi-action task
- **Reliability:** Computer Use misclicks on complex UIs. Stick to voice → vault for v1, defer screen control
- **Safety:** AI with full mouse/keyboard control is genuinely risky. When v3 adds Computer Use, sandbox anything destructive

## Decisions locked in (2026-05-14)

From Q&A with Jake:
- **Daily shape:** desk + deep work
- **Primary device:** Windows desktop (this machine)
- **Top job:** voice → vault capture
- **Friction tolerance:** low (hotkey or app-open is fine, not zero-friction wake word yet)

These pin v1 to the hotkey + Whisper + `claude -p` + TTS architecture above.

## Related build plans

- `High Priority/01-meta-ads-mcp.md` — feeds the "ad ops voice query" intent in v1.5
- `Mid Priority/05-activity-log-and-memory-writeback.md` — same memory substrate Jarvis will write to
- `Mid Priority/06-morning-ops-briefing.md` — becomes the v2 voice briefing
