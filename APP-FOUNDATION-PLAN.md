# Hauck Marketing Lab — App Foundation Plan

> **Status (2026-05-10):** Architectural foundation locked. Design system locked. v1 build scope is the base shell only — features added incrementally.

---

## Context

Jake Hauck (Hauck Marketing) has built a substantial AI-assisted media buying system at `C:\Users\games\Desktop\hauck-marketing-lab\` — 556 markdown/YAML files totaling ~2.4 MB. It comprises 5 specialized AI agents, 18 skills across 5 categories, 517 knowledge chunks, expert frameworks, templates, and slash commands. Today the system is activated through Claude Code's slash commands; there is zero application code.

**The need:** A clean graphical interface to interact with this existing system, usable across Jake's MacBook and Windows PC, with no recurring fees and no separate AI billing.

**The intent:** Wrap the existing folder in a polished UI without duplicating, migrating, or re-platforming any of its content.

---

## Locked Architectural Decisions

These are settled and should not be re-litigated.

### 1. The folder is the source of truth
The app does **not** copy content into a database. It reads `media-buying/` directly and writes new outputs (chats, generated copy, reports) back into the same folder as markdown files. Existing tools — Claude Code, VS Code, Obsidian — continue to work on the same files unchanged.

**Why:** zero migration cost; data never trapped in the app; existing slash commands still function; future-proof.

### 2. Cross-platform desktop app via Tauri
- Single codebase, builds for both macOS (`.dmg`) and Windows (`.exe`)
- ~5 MB bundle; Rust backend + web frontend
- Free and open-source; no licensing fees

**Why over Electron:** smaller, faster, no per-app overhead. **Why over native:** one codebase for two OSes. **Why over a web app:** zero hosting cost, no auth needed, fully offline-capable.

### 3. Mac↔PC sync via folder-level sync (not in-app sync)
The user keeps `hauck-marketing-lab/` in iCloud Drive, OneDrive, Dropbox, or a private git repo. Both machines read from their local copy of the synced folder. The app itself has no sync logic, no export/import buttons, no merge conflicts to handle.

**Why:** the problem is already solved by mature consumer-grade tools; reinventing it would add complexity for no gain.

### 4. Claude Code (headless mode) is the LLM engine
The app shells out to the `claude -p` command-line binary as a subprocess for every agent invocation. Authentication is whatever the user is already logged into Claude Code with. On a Claude Max subscription, this means **no per-token API charges** — the subscription absorbs the cost.

Example invocation pattern:
```
claude -p "<system_prompt + context + user_input>" --output-format stream-json
```

**Why:** Jake already has Claude Code installed and logged in on both machines. No API keys to manage, no separate billing, no BYOK flow. Marginal cost of running the app is genuinely $0.

### 5. Output persistence as markdown files
Every chat, generated hook batch, diagnosis, brief, and report is written back to the folder as a markdown file with YAML frontmatter — same format as existing knowledge chunks. Suggested locations:
- `chats/YYYY-MM-DD-slug.md`
- `outputs/hooks/`, `outputs/briefs/`, `outputs/diagnoses/`, `outputs/reports/`

**Why:** consistency with existing content; readable outside the app; portable; git-friendly.

---

## Resolved Implementation Decisions (2026-05-10)

### Frontend stack inside Tauri
**React + Vite + Tailwind CSS + shadcn/ui.** Largest ecosystem for chat UI, forms, and dense tabular layouts. shadcn primitives without lock-in. Vite is the clean default for Tauri.

### UI structure
**Dashboard-first, single window, right-edge chat drawer.** Home screen is a campaign dashboard for the active client (defaults to Willis Windows). The chat drawer slides in from the right when an agent is invoked or `⌘K` is pressed. Dashboard remains visible behind a dimmed overlay while the drawer is open.

### Aesthetic direction
**"Mission Control"** — dark cockpit, copper accents on charcoal. Source of truth: `mockups/mission-control-final.html`.

### Streaming UX
**Token-by-token rendering** via `claude -p --output-format stream-json`. First-token latency on large system prompts is 3–8s; streaming hides that.

### Conversation context strategy
**Static per-agent system prompt + keyword-triggered knowledge chunks.** Each `claude -p` call assembles its prompt from:
1. The agent's full markdown body as the system prompt (parsed from `agents/<name>.md`)
2. Knowledge chunks pulled by keyword match against the user's input (router logic already exists in `media-buying/skills/_skill-router.yaml`; routing keywords are also documented in `media-buying/DEVELOPER-GUIDE.md` line 272)
3. The full conversation history (see Conversation Memory below)

RAG-style embeddings are deferred. 517 chunks won't fit in context, but keyword routing covers v1 cases without a vector pipeline.

### Conversation memory
**Replay the full conversation history in each prompt.** Each chat file in `chats/` IS the history; the app reads the file and re-sends it on every turn. Matches the "folder is source of truth" principle. Claude Max absorbs the token cost. Resume-by-session-ID and long-lived subprocess approaches add plumbing complexity for marginal savings.

### File-watcher behavior
**Refresh on window focus + manual reload button.** No live file-watching. Covers iCloud/OneDrive sync cleanly without mid-edit-read race conditions.

### Versioning / history
**Files only. "Session" = filename in `chats/`.** No separate threading concept inside the app. The filesystem already does this.

---

## Design System

### Typography
- **Hanken Grotesk** (300–800) — body prose, headlines, UI labels, button text
- **JetBrains Mono** (400–600) — numbers, file paths, eyebrows, status text, keyboard hints, agent names in small contexts
- **Newsreader** (300–500) — minor accents only (small icons, monogram letters). **Not for primary headlines** — italic serif at large sizes reads as "cursive" and reduces scannability.

Type scale: 15.5px body / 36px KPI numbers / 40px hero headline / 22px section heads / 11–12px mono labels.

### Color tokens
```css
--bg-void:    #08090d;   /* page background */
--bg-deep:    #0c0f17;   /* nested panels, inputs */
--bg-surface: #11151f;   /* primary surfaces */
--bg-elev:    #161b28;   /* hover, elevated */

--text:       #eef1f7;   /* primary copy */
--text-mid:   #c5ccdb;   /* secondary copy */
--text-muted: #95a0b3;   /* tertiary, meta */
--text-faint: #5a6378;   /* faint labels */

--border:        rgba(180, 200, 240, 0.08);
--border-strong: rgba(180, 200, 240, 0.18);

--copper:      #ec9849;  /* single accent — used sparingly */
--copper-soft: #c9722a;
--copper-glow: rgba(236, 152, 73, 0.38);

--signal-go:   #5fe699;  /* healthy / scale-ready */
--signal-hold: #fbbf24;  /* hold / warning */
--signal-stop: #f87171;  /* kill / over threshold */
```

No `border-radius` over 4px anywhere. Mission Control, not consumer SaaS.

### Component patterns established
- **Status bar** — 42px top strip, JBM caps, JARVIS pulse dot, date/day-of-evaluation, subscription tag, active client pill
- **Agent rail** — 100px left rail, 5 circular agent buttons (A/Z/V/N/S). Active agent: copper highlight + "ON CALL" status with typing dots + dimmed siblings (~42% opacity) + copper hairline + nudging chevron extending toward the drawer
- **Hero block** — eyebrow + verdict pill, sans-serif statement headline (40px, 500 weight, not italic), body paragraph, kill–hold–scale spectrum bar with "YOU ARE HERE" marker
- **KPI strip** — 6 cards, mono values, label + benchmark + delta + sparkline
- **Diagnosis panel** — sub-headline + agent-attributed findings (severity dots + agent label + body) + actions row
- **Tracking pulse** — 3 conic-gradient dials (Pixel / CAPI / EMQ) + recommendation note
- **Creative diversity ring** — half-radial showing N/15 active variants + creative list
- **Activity feed / Recent threads** — mono timestamps, sans body, mono file paths
- **Floating ask dock** — bottom-right, opens chat drawer
- **Chat drawer** — 540px right slide-out. Header → in-drawer agent switcher → conversation thread → skill chips → input bar
- **Conversation messages** — mono caps labels (`YOU ›` / `AGENT ›`) above sans body; structured findings render as nested mini-panels with severity dots
- **Streaming caret** — 2px copper vertical bar, blinks at end of last agent message
- **Skill chips** — quick-trigger pills above the input bar; chip click scaffolds a structured prompt
- **Command palette (`⌘K`)** — searchable overlay for skills, knowledge chunks, threads; accessible from any input

---

## Reference Mockups

Located in `mockups/`. Each surface has both an HTML mockup (the implementation source of truth — open in any browser, no build step) and a PNG screenshot (for at-a-glance visual reference, especially useful for sessions reading the plan as text).

| Surface | HTML (source) | PNG (preview) | Purpose |
|---|---|---|---|
| Dashboard | `mockups/mission-control-final.html` | `mockups/dashboard.png` | Full home view: hero, KPIs, diagnosis, tracking, creative diversity, activity feed, recent threads, floating ask dock |
| Chat drawer | `mockups/chat-final.html` | `mockups/chat.png` | Open state with active agent rail (Aurelius on call), in-drawer agent switcher, 5-message conversation including structured Zenith findings inset, skill chips above input, `⌘K` hint |

**For implementation:** open the HTML files in a browser. They are the source of truth — lift the CSS variables, font imports, and structural patterns directly into React components.

**For quick visual reference:** view the PNGs. They are screenshots of the HTML at 1440px viewport width, regenerated whenever the HTML changes substantively.

**To regenerate the PNGs after editing the HTML:**
```
chrome --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=4000 \
  --window-size=1440,1100 \
  --screenshot="mockups/dashboard.png" \
  "file:///<absolute-path>/mockups/mission-control-final.html"
```
(Adjust window-size to 1440x900 for the chat surface.)

---

## Existing Assets the App Must Surface

These already exist and should be **read and rendered**, never rewritten:

| Asset | Path | Count |
|---|---|---|
| Agent definitions | `media-buying/agents/*.md` | 5 (Aurelius, Zenith, Vortex, Nexus, Stratos) |
| Skill specs | `media-buying/skills/[category]/*/SKILL.md` | 18 across 5 categories |
| Knowledge chunks | `media-buying/knowledge/TFC-*.md` | 517 |
| Slash commands | `media-buying/commands/*.md` | 5 |
| Templates | `media-buying/skills/templates/*.md` | 3 (creative brief, campaign audit, performance report) |
| Checklists | `media-buying/skills/checklists/*.md` | 2 |
| Benchmark data | `media-buying/skills/data/benchmarks-brasil.yaml` | 1 |
| Skill registry/router | `media-buying/skills/_registry.yaml`, `_skill-router.yaml` | 2 |
| System overview | `media-buying/README.md`, `media-buying/DEVELOPER-GUIDE.md` | 2 |

All files use YAML frontmatter + markdown body. The DEVELOPER-GUIDE.md contains parsing patterns and proposed schemas — treat it as authoritative *for parsing*; ignore its aspirational SQL schemas and `/api/diagnose` endpoints (those predate the locked decisions).

---

## Non-Goals (Explicit Exclusions)

- **No database.** Not SQLite, not Postgres, not even a JSON store for app state. Files only.
- **No cloud backend.** No Supabase, no Vercel, no hosted anything.
- **No authentication.** Single-user app; the OS login is the auth boundary.
- **No multi-tenancy / white-labeling / client portal.** This is Jake's internal tool.
- **No Meta Ads API integration in v1.** Campaign metrics enter the app via paste/CSV upload.
- **No AI cost beyond Jake's existing Claude subscription.** No BYOK; no Ollama; no OpenAI fallback.
- **No replacement of Claude Code.** The app and Claude Code coexist on the same folder.
- **No Brazilian-market lock-in.** Existing benchmarks YAML is Brazilian-flavored; localization/benchmark sets are configurable.
- **No design-system divergence.** Match `mockups/mission-control-final.html` and `mockups/chat-final.html` exactly. No new fonts, palettes, or aesthetic ideas.

---

## Known Mismatches the Next Terminal Should Address

Surfaced during exploration; flagged for awareness, not for resolution here:

1. The existing system is heavily oriented toward Brazilian high-ticket challenge funnels (R$ benchmarks, $200K minimum budgets, webinars). Jake's actual client (Willis Windows) is US local lead-gen. The app's defaults and templated forms should reflect Jake's real practice, not the imported framework's assumptions.
2. Many files reference "Your Agency", "CMO", "COO", "CSO" — generic placeholders from the original template source. These will need a rename pass at some point, though this is content work, not app work.
3. The benchmark YAML is named `benchmarks-brasil.yaml`. Multi-locale benchmarks (US lead-gen for Willis Windows etc.) are absent and will need to be added.

---

## v1 Build Scope

**Base shell only.** Features added incrementally after the foundation is functional and signed off.

### v1 must include

1. Tauri shell that compiles + runs on both macOS and Windows
2. First-launch folder picker (defaults to `media-buying/` if found in obvious locations)
3. Dashboard rendered with parsed-from-folder content — 5 agent buttons in the rail, hero placeholder, KPI strip with paste-input affordance
4. Chat drawer that successfully shells out to `claude -p` and streams a response back token-by-token
5. Active-rail state implemented per `mockups/chat-final.html` (copper highlight + "ON CALL" status + dimmed siblings + connector hairline)
6. Conversation persistence — each chat saves to `chats/YYYY-MM-DD-slug.md` with YAML frontmatter
7. Refresh-on-focus reload of folder contents
8. `⌘K` shortcut wired (opens an empty/placeholder palette is acceptable in v1; populating it from skill registry is a follow-up)

### v1 deliberately omits (build later)

- Hook generator UI
- Diagnosis form (paste / structured input flow)
- Knowledge browser
- Full skill command palette population
- Multi-client management (single client hardcoded)
- Settings / preferences screen
- Report builder, scale-readiness UI, tracking audit UI
- Output materialization back to dashboard cards (e.g., "send this finding to the diagnosis panel")
- Workflow chains (launch / optimize / scale flows from `media-buying/README.md`)

---

## Verification

End-to-end smoke test for v1:

1. App launches on both macOS and Windows from a fresh install.
2. App auto-discovers `media-buying/` (configurable folder picker on first launch).
3. Dashboard renders with the Mission Control aesthetic — fonts load (Hanken Grotesk + JetBrains Mono + Newsreader), copper accents present, layout matches `mockups/mission-control-final.html`.
4. All 5 agents appear in the rail, parsed from `agents/*.md` frontmatter.
5. Clicking an agent button opens the chat drawer with the active-rail state per `mockups/chat-final.html`.
6. Sending "What's wrong with my CPM at $45?" results in a `claude -p` subprocess call streaming a real diagnostic response token-by-token.
7. The conversation saves to `chats/YYYY-MM-DD-cpm-question.md` with YAML frontmatter and markdown body.
8. Closing the app, syncing the folder via iCloud/OneDrive, and opening the app on the other machine shows the same chat in history.
9. No network calls hit any backend other than Anthropic's (via Claude Code).
10. No charges appear on any account other than Jake's existing Claude subscription.

---

*Foundation plan — locked decisions only. Feature roadmap deferred until base shell ships.*
