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

---

## 2026-05-12 — Memory system finished (steps 4-6 + CLAUDE.md cutover)

Wrapped the Obsidian-vault memory system kicked off in commit `ccafae8`. The three handoff documents in `docs/handoffs/` are now fully shipped:

- **Step 4 — `AboutSettings.tsx`** wired into `SettingsPage.tsx`. Tabbed editor for `vault/About/Jake.md` and `vault/About/Hauck Marketing.md`. Frontmatter round-tripped via the loaded `note.front`; body is a single markdown textarea per slot.
- **Step 5 — `ClientProfileForm.tsx`** wired into `ClientsPage.tsx` for both "new" and "edit" modes. Structured fields → `buildProfileBody` → `vault/Clients/<Name>/Profile.md`. Re-open re-parses via `parseProfileBody`.
- **Step 6 — Save-to-memory chat action** in `ChatDrawer.tsx`. Two entry points: a "Save to memory" button on each agent turn (opens a pre-filled draft modal) and a `/remember <fact>` slash command in the chat input that bypasses the LLM. Both call `api.appendToMemory(root, clientSlug, fact)`. `/help` and `/?` print the command list as a toast. The Rust `append_to_memory` auto-seeds `Memory.md` if missing.

### Deviation — root `CLAUDE.md` not deleted, replaced with a pointer stub
**Handoff item:** Step 4 final note — "the root `CLAUDE.md` becomes redundant — leave that deletion as the **last** step, gated on Jake's verification."

**Deviation:** Replaced the rule content with a thin pointer + identity stub instead of deleting outright.

**Why:** The in-app prompt assembler (`app/src/lib/prompt.ts`) doesn't read `CLAUDE.md` — it pulls from `vault/About/` directly via `api.readAboutNotes`. But CLI Claude Code sessions (e.g., `claude -p` in this repo from a terminal) *do* read `CLAUDE.md`. Hard-deleting it would silently strip identity context from CLI sessions. The pointer stub keeps a minimal "address Jake as Sir / read the vault for real rules" instruction for CLI callers while making clear the editable source of truth is the vault.

**Reversal cost:** Trivial. Delete `CLAUDE.md` if/when CLI sessions are no longer in use.

### Status
- `pnpm tsc --noEmit` clean from `app/`.
- Vault on disk: `vault/About/Jake.md`, `vault/About/Hauck Marketing.md`, `vault/Clients/Willis Windows/Profile.md`, `vault/Clients/Willis Windows/Memory.md` all present with correct frontmatter.
- Willis Windows `Profile.md` body is still placeholder text (`_(fill in — …)_`) — Jake fills it in via Settings → Manage clients → Edit profile, not a build task.

### Bug fix — vault path resolution
Discovered during the wrap-up: the Rust `vault_root(root)` was hard-coded to `<root>/vault`, but `root` is the **media-buying** folder (per `config.json`) while the actual Obsidian vault lives at the **project root** (`hauck-marketing-lab/vault/`, sibling of `media-buying/`). Result: every vault read returned empty silently, and any in-app save (`/remember`, About edits, Profile saves) would have written to a parallel `media-buying/vault/` invisible to Obsidian. None of the in-app forms had been exercised yet, so no orphan files existed.

**Fix:**
- `vault.rs:7` — `vault_root()` now prefers the sibling layout (`<root>/../vault`) if it exists, and falls back to nested (`<root>/vault`) otherwise. Both layouts are now supported.
- Added a new `vault_root_path` Tauri command so the frontend can resolve the same path the Rust side will use (needed because `clientProfile.ts:profilePathFor` had the same `${root}/vault/...` bug).
- `clientProfile.ts:profilePathFor` now takes `vaultRoot` (a resolved absolute path) instead of the app root. `ClientProfileForm.tsx:handleSave` resolves it via `api.vaultRootPath(root)` before writing.

`cargo check` and `pnpm tsc --noEmit` both clean after the fix. **A Tauri rebuild is required** for the Rust change to take effect — restart `pnpm tauri dev` (or build a new bundle).

