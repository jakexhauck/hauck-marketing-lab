# Build Checklist — Hauck Marketing Lab App

> **Audience:** The terminal session implementing the v1 base shell.
> **Companion docs:** `APP-FOUNDATION-PLAN.md` (the spec), `mockups/mission-control-final.html` + `mockups/chat-final.html` (the design source of truth).
> **Rule:** Every checkbox below must be verifiable. Don't tick without proving it.

---

## Phase 0 — Read Before You Type

Do not write a single line of code until these are done.

- [ ] Read `APP-FOUNDATION-PLAN.md` end-to-end. Note the **Locked Architectural Decisions** and **Resolved Implementation Decisions** sections — these are not open questions.
- [ ] Open `mockups/mission-control-final.html` in a browser. This is the dashboard.
- [ ] Open `mockups/chat-final.html` in a browser. This is the chat drawer open state.
- [ ] View `mockups/dashboard.png` and `mockups/chat.png` side-by-side with the HTML to confirm what you're rendering matches.
- [ ] Read `media-buying/agents/aurelius.md` in full. Understand the YAML frontmatter shape — every agent file follows the same pattern.
- [ ] Skim `media-buying/skills/_skill-router.yaml` and `media-buying/DEVELOPER-GUIDE.md` (line 272 has the keyword routing map).
- [ ] Read the **Non-Goals** section of the plan twice. If you catch yourself reaching for Postgres, Supabase, auth, BYOK keys, or "let me redesign the colors," stop.

---

## Phase 1 — Environment Prerequisites

Verify on **the machine you're building on first** (probably Windows given the working directory). Re-verify on Mac before declaring done.

- [ ] Rust toolchain installed: `rustc --version` returns ≥ 1.70
- [ ] Node.js installed: `node --version` returns ≥ 18
- [ ] pnpm or npm available (pnpm preferred for Tauri projects)
- [ ] Tauri CLI works: `cargo install tauri-cli` succeeds, then `cargo tauri --version` returns a version
- [ ] **Critical:** `claude --version` runs from a plain shell. The app shells out to this binary; if the PATH doesn't see it, nothing works.
- [ ] **Critical:** `claude -p "say hi"` returns a real response without prompting for API keys. Confirms the user's subscription is active and headless mode is authenticated.
- [ ] Platform-specific Tauri prerequisites installed (WebView2 on Windows; Xcode CLI tools on Mac). See https://tauri.app/start/prerequisites/

---

## Phase 2 — Scaffold the Project

- [ ] Create `app/` folder at project root (`C:\Users\games\Desktop\hauck-marketing-lab\app\`). Do NOT put the app inside `media-buying/`.
- [ ] Scaffold with `pnpm create tauri-app` using the **React + TypeScript + Vite** template
- [ ] Install Tailwind CSS following Tauri-compatible setup (`tailwindcss`, `postcss`, `autoprefixer` + Vite plugin)
- [ ] Install shadcn/ui CLI; initialize with `pnpm dlx shadcn@latest init`
- [ ] Configure shadcn for the locked color tokens — paste the CSS variables from `APP-FOUNDATION-PLAN.md` § Design System → Color tokens into `app/src/index.css` under `:root`
- [ ] Wire up font imports for Hanken Grotesk + JetBrains Mono + Newsreader (use Google Fonts via `<link>` in `index.html` or `@font-face` — match the mockup HTML)
- [ ] Confirm `pnpm tauri dev` opens a window with a blank React app on your current OS
- [ ] Commit this clean scaffold before touching it further. Tag as `scaffold-baseline`.

---

## Phase 3 — Build the Base Shell (v1 Scope)

Follow the order in `APP-FOUNDATION-PLAN.md` § v1 Build Scope. Each item below maps to one of those eight.

### 3.1 Folder discovery and parsing layer (do this first, before any UI)

- [ ] Tauri command (Rust side) that takes a folder path and returns parsed `media-buying/` contents: agents (with frontmatter), skill list, recent chats. Use `serde_yaml` + a minimal markdown frontmatter splitter.
- [ ] First-launch folder picker via Tauri's `dialog::open()`. Default-discover by checking common locations (`~/Desktop/hauck-marketing-lab/`, `~/Documents/...`, `~/iCloud Drive/.../hauck-marketing-lab/`).
- [ ] Selected path persisted to Tauri's app config dir (this is config, not user data — config can be a small JSON file, that's allowed; user data is markdown in the folder).
- [ ] Reload-on-focus: listen for the Tauri window `focus` event, re-parse folder.
- [ ] Manual refresh button in status bar.

### 3.2 Dashboard surface (match `mission-control-final.html`)

- [ ] Status bar (42px, JBM caps, JARVIS pulse dot, date, subscription tag, active client pill). Hardcode "WILLIS WINDOWS" as the active client pill — multi-client comes later.
- [ ] Agent rail (100px left, 5 circular buttons A/Z/V/N/S parsed from `agents/*.md` frontmatter).
- [ ] Hero block (eyebrow + verdict pill + 40px sans headline + kill-hold-scale spectrum bar) — placeholder content is fine in v1; real content arrives when diagnoses ship.
- [ ] KPI strip (6 cards) with paste-input affordance — values can be placeholder ("—") in v1; clicking a card opens an input later.
- [ ] Diagnosis panel, tracking pulse, creative diversity ring — render as **static panels with placeholder content** that match the mockup visually. Don't wire to data yet (deferred).
- [ ] Activity feed / Recent threads — list the markdown files in `chats/` (mono timestamps, sans body, mono file paths). This IS real data; populate as you go.
- [ ] Floating ask dock (bottom-right) — opens chat drawer on click.

### 3.3 Chat drawer (match `chat-final.html`)

- [ ] 540px right slide-out, dimmed overlay behind, animates in/out.
- [ ] Header with agent name + in-drawer agent switcher.
- [ ] Conversation thread area, scrollable.
- [ ] Mono caps labels (`YOU ›` / `AGENT ›`) above sans body for each message.
- [ ] Skill chips row above input bar (placeholder chips in v1 — list of skill names is fine; actual scaffold-prompt-on-click is later).
- [ ] Input bar with `⌘K` hint.
- [ ] Streaming caret (2px copper vertical bar, blink animation) at the tail of the current streaming response.

### 3.4 Agent rail active state (match `chat-final.html`)

- [ ] When chat drawer opens for an agent, that agent's button gets: copper highlight + "ON CALL" status with typing dots, while sibling buttons drop to ~42% opacity, a copper hairline appears, and the nudging chevron extends toward the drawer.

### 3.5 `claude -p` subprocess wiring (the critical path — verify early)

- [ ] Tauri Rust command that spawns `claude -p <prompt> --output-format stream-json` and streams stdout back to the frontend via Tauri events.
- [ ] Frontend listens for stream events and appends tokens to the active message.
- [ ] Prompt assembly logic on the frontend: build the prompt from (a) selected agent's full markdown body as system prompt, (b) keyword-matched knowledge chunks, (c) full conversation history from the chat file.
- [ ] Keyword routing: implement the simple keyword → knowledge-chunk map from `media-buying/DEVELOPER-GUIDE.md` line 272 and `media-buying/skills/_skill-router.yaml`. **No embeddings.**
- [ ] Graceful failure if `claude` binary not found: show a clear in-app message ("Claude Code not detected. Install from claude.ai/code and log in, then restart the app.").

### 3.6 Conversation persistence

- [ ] On first user message in a new chat, create `chats/YYYY-MM-DD-<slug>.md` with YAML frontmatter (agent, started_at, slug) and an empty body.
- [ ] On every turn, append `## You` and `## Agent` sections with timestamps to the file.
- [ ] Resuming a chat (clicking it in Recent threads) reads the file and rehydrates the conversation in the drawer.
- [ ] Slug generation: first 5-6 words of the user's opening question, lowercased, hyphenated.

### 3.7 `⌘K` shortcut

- [ ] Global keybind opens a placeholder palette overlay (empty list + search input is acceptable for v1).
- [ ] Confirm Mac uses `⌘K` and Windows uses `Ctrl+K`.

---

## Phase 4 — Implementation Guardrails (re-check at every commit)

If you catch yourself doing any of these, stop and reconsider:

- [ ] **No `border-radius` over 4px anywhere.** Mission Control aesthetic. If a shadcn primitive defaults to `rounded-md` or higher, override it.
- [ ] **No italic serif headlines.** Newsreader is for tiny accents only. Headlines use Hanken Grotesk at 500 weight.
- [ ] **No new colors.** If you need a color that isn't in the locked tokens, ask Jake — don't invent one.
- [ ] **No SQLite, no IndexedDB, no Zustand-with-persist.** App state in memory; user data in markdown files.
- [ ] **No tRPC, no React Query against a backend, no API routes.** All "backend" calls go through Tauri commands invoking Rust → filesystem or `claude -p` subprocess.
- [ ] **No `crypto`, no auth libraries, no JWT.** Single-user OS-bounded.
- [ ] **No file watchers.** Refresh-on-focus only. Resist the urge to add `chokidar` or `notify` — sync conflicts will eat you alive.
- [ ] **No embeddings, no vector DB.** Keyword routing only in v1.
- [ ] **No features outside the v1 list.** If it's in "v1 deliberately omits," do not build it — even if it's tempting because it's "easy."

---

## Phase 5 — Cross-Platform Sanity (before declaring v1 done)

- [ ] Build runs `pnpm tauri build` cleanly on Windows → produces `.msi` and/or `.exe` installer.
- [ ] Build runs `pnpm tauri build` cleanly on macOS → produces `.dmg`.
- [ ] Install on Mac. Launch. Folder picker works. Pick the synced folder location. Dashboard renders identically to Windows.
- [ ] Send a test message on Mac. Confirm it streams. Confirm the chat file appears in `chats/`.
- [ ] Close on Mac. Wait for cloud sync. Open on Windows. The Mac-created chat appears in Recent threads.
- [ ] Open the chat from Recent threads. Conversation rehydrates from the file.
- [ ] Continue the conversation. New turn appends to the same file. Reopen on Mac → both turns visible.

---

## Phase 6 — v1 Smoke Test (the 10-step in the plan, in order)

Run every item in `APP-FOUNDATION-PLAN.md` § Verification. All 10 must pass:

- [ ] App launches on both macOS and Windows from a fresh install
- [ ] Folder auto-discovery or folder picker works on first launch
- [ ] Dashboard renders with Mission Control aesthetic (all three fonts loaded, copper accents, layout matches mockup)
- [ ] All 5 agents in the rail, parsed from frontmatter
- [ ] Clicking an agent opens the drawer with the active-rail state correct
- [ ] "What's wrong with my CPM at $45?" streams a real diagnostic response
- [ ] Conversation saves to `chats/YYYY-MM-DD-cpm-question.md` with frontmatter + body
- [ ] Sync the folder; conversation appears on the other machine
- [ ] No network calls hit anything outside Anthropic (via Claude Code) — verify with the OS network monitor or Tauri's `http-api` allowlist set to deny
- [ ] No charges appear on any account (re-confirm with Jake at end of week)

---

## Phase 7 — Hand-back to Jake

When all of Phase 6 passes:

- [ ] Commit everything to git (initialize the repo if needed — `git init` at project root).
- [ ] Add a top-level `README.md` for the `app/` folder with: how to run dev, how to build for each OS, where the config file lives, how to nuke and re-pick the folder.
- [ ] Document any deviations from the plan in a `BUILD-NOTES.md` at the project root — list every spot where reality forced a deviation and why.
- [ ] Confirm to Jake: "v1 base shell complete. The eight v1 scope items from the plan are functional. The deferred features in 'v1 deliberately omits' have not been touched."
- [ ] Do **not** ship v1.1 features (hook generator, diagnosis form, knowledge browser, multi-client) in the same session. Those are separate scope.

---

## Common Pitfalls (lessons we expect you to learn the easy way)

1. **Tauri's allowlist will bite.** You need to enable `shell.execute` for the `claude` binary and `fs.readFile`/`writeFile` scoped to the user-picked folder. Tauri's default is locked down; budget time to configure `tauri.conf.json` correctly.
2. **Cross-platform path handling.** Use Rust's `std::path::PathBuf` and Node's `path` module — never string-concatenate paths with `/` or `\`.
3. **The `claude` binary's location varies.** On Mac it might be in `/opt/homebrew/bin` or `~/.local/bin`; on Windows in `%APPDATA%\npm\` or `%USERPROFILE%\AppData\Roaming\npm\`. Use a `which`/`where` lookup or rely on PATH.
4. **Streaming JSON parsing.** `--output-format stream-json` emits newline-delimited JSON objects. Parse incrementally, not as one blob. Don't `JSON.parse` until you've seen a complete line.
5. **Cold-start latency is real.** The first `claude -p` call after app launch may take 3–8 seconds before the first token. Show the streaming caret immediately so the user knows something is happening.
6. **iCloud Drive on Windows has quirks.** Files may exist as `.icloud` placeholders before fully downloading. Test sync with a >100KB chat file and confirm both machines actually see content, not stubs.

---

*Tick everything. Then hand back.*
