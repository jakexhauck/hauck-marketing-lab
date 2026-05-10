# Build Notes — Hauck Marketing Lab App

Living record of deviations from `APP-FOUNDATION-PLAN.md` and `BUILD-CHECKLIST.md` during implementation. Each entry: what changed, why, when.

---

## 2026-05-10 — Scaffold baseline

### Versions
- Tauri 2.11.1 (CLI shipped with template) + `tauri-cli` cargo crate ^2.0 installed globally
- React 19.2.6 + Vite 7.3.3 + TypeScript 5.8.3
- Tailwind CSS 4.3.0 via `@tailwindcss/vite` plugin (no `tailwind.config.js` — v4 uses CSS-only theme config)
- Node 24.15.0, pnpm 11.0.9, Rust 1.95.0

### Deviation: shadcn/ui not initialized in v1
**Checklist item:** Phase 2 → "Install shadcn/ui CLI; initialize with `pnpm dlx shadcn@latest init`"

**Deviation:** Skipped. Installed `clsx` + `tailwind-merge` directly (the two libs shadcn's `cn()` helper composes) instead.

**Why:** The v1 base-shell mockups (`mockups/mission-control-final.html`, `mockups/chat-final.html`) define every visual surface in custom CSS — status bar, agent rail, hero block, KPI strip, diagnosis panel, tracking dials, creative ring, activity feed, chat drawer, skill chips, input bar. None match shadcn primitives cleanly. Adding shadcn for v1 would import primitives we don't use yet (Phase 4 guardrail: "No features outside the v1 list"). Will install shadcn at the point a real primitive is needed (likely Dialog or Dropdown when the command palette becomes interactive in v1.1).

**Reversal cost:** Trivial. `pnpm dlx shadcn@latest init` whenever we add the first primitive. The `cn()` helper signature is compatible — same arguments, same return.

### Deviation: `beforeDevCommand` is `npx vite`, not `pnpm dev`
**Checklist item:** Phase 2 / Phase 5 imply standard `pnpm tauri dev` / `pnpm tauri build` invocation.

**Deviation:** `src-tauri/tauri.conf.json` sets `beforeDevCommand: "npx vite"` and `beforeBuildCommand: "npx tsc && npx vite build"`.

**Why:** pnpm v11's `verify-deps-before-run` check exits nonzero on any "ignored build script" warning even when `pnpm install` itself succeeds, which broke `pnpm tauri dev`. esbuild is now approved via `app/pnpm-workspace.yaml` (`allowBuilds: esbuild: true`), but `npx` calls keep the hooks pnpm-version-agnostic — future pnpm changes won't gate the dev loop.

### Deviation: Keyword-routed knowledge chunks deferred
**Checklist item:** Phase 3.5 → "Keyword routing: implement the simple keyword → knowledge-chunk map from media-buying/DEVELOPER-GUIDE.md line 272 and media-buying/skills/_skill-router.yaml. No embeddings."

**Deviation:** v1 prompt assembly (in `app/src/lib/prompt.ts`) sends agent body + full conversation history + user input. Keyword routing into the 517-chunk knowledge base is **not wired** in v1.0.

**Why:** Punting the router lets the v1 base shell ship end-to-end (folder picker → dashboard → chat drawer → streaming → markdown persistence) without a partial keyword-routing implementation polluting the critical path. The agent body itself contains substantial context — sufficient for v1 verification. Router slots in cleanly via a follow-up function call in `assemblePrompt()` once we read `_skill-router.yaml`.

**Status:** v1.1 task. Test it works first, then add routing.

### v1 base shell status — built, ready to verify visually
- Tauri 2.11.1 desktop shell builds and launches on Windows
- First-launch folder picker with auto-discovery (`config::suggest_folder_candidates`)
- Folder parser reads `agents/*.md`, `chats/*.md`, counts `knowledge/`, `skills/`
- Dashboard renders Mission Control aesthetic — status bar, agent rail (5 buttons from frontmatter), hero, 6 KPIs, diagnosis panel, tracking pulse, creative ring, activity feed (real chats), recent threads (real chats), floating ask dock
- Chat drawer: 540px slide-out, agent header, in-drawer agent switcher, conversation thread, skill chips, input bar with `⌘↵` send hint
- Streaming via `claude -p --output-format stream-json --verbose` — Rust spawns subprocess with `tokio::process::Command`, parses JSONL stdout, emits `claude://stream` events per token
- Conversations persist to `media-buying/chats/YYYY-MM-DD-<slug>.md` with YAML frontmatter + `## You` / `## <Agent>` sections, machine-readable `<!-- at: ... -->` timestamps
- Active rail state per `mockups/chat-final.html` — copper highlight, ON CALL pill with typing dots, dimmed siblings at 42% opacity, copper hairline connector, nudging chevron, rail glow
- Cmd/Ctrl+K opens a placeholder palette overlay (populated in v1.1)
- Window focus event triggers folder reload
- Selected folder persisted to OS app-config dir as `config.json`
