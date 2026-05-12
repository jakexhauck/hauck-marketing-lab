# Handoff — Step 4: "About Jake" settings form

You are continuing the Hauck Marketing Lab build. Steps 1-3 are complete: the Obsidian vault foundation is in place at `vault/`, the Rust `vault.rs` module exposes 7 Tauri commands, and `prompt.ts` now injects `vault/About/Jake.md` and `vault/About/Hauck Marketing.md` into every chat turn.

Read these memory files first so you understand the architecture:
- `MEMORY.md` (the index)
- `project_obsidian_vault.md` (vault layout, sync, retrieval rules)
- `project_app_foundation.md` (Tauri, no-DB, folder-as-source-of-truth)

## Goal

Build a Settings page section where Jake can edit his identity/voice rules and the agency's ad-copy rules. The form writes to `vault/About/Jake.md` and `vault/About/Hauck Marketing.md`. Once these notes exist and are editable in-app, the root `CLAUDE.md` becomes redundant — leave that deletion as the **last** step, gated on Jake's verification.

## Context that's already in place

**Vault notes that already exist:**
- `vault/About/Jake.md` — pre-seeded with identity + how-to-talk-to-me rules (migrated from root `CLAUDE.md`)
- `vault/About/Hauck Marketing.md` — pre-seeded with voice + ad-copy rules + what-I-never-do

Both have YAML frontmatter:
```yaml
---
type: about
subject: jake | agency
client: all
agent: all
tags: [...]
---
```

**Tauri commands available (already wired in `app/src/lib/tauri.ts` as `api.*`):**
- `api.readAboutNotes(root)` → returns `VaultNote[]` — Jake.md first, then Hauck Marketing.md
- `api.writeVaultNote(root, path, front, body)` → overwrites a note. `front` is `NoteFront`, `body` is the markdown body **without** frontmatter
- `api.readVaultNote(root, path)` → single note

**Types available** (`app/src/lib/types.ts`):
- `VaultNote` = `{ path, rel_path, front, body }`
- `NoteFront` = open-ended record, common fields: `type`, `subject`, `client`, `agent`, `tags`, `status`

## What to build

### UI placement

Find the existing settings/preferences surface in the app. Likely candidates: `app/src/components/Settings.tsx` (if present) or somewhere in `MainDashboard/`. If no dedicated settings page exists, add a new view registered in `App.tsx`'s `WorkspaceView` union (see how other views like `clients`, `knowledge` are routed).

The form lives at `Settings → About` (tab or section). Two subsections, side-by-side or tabbed:
1. **About Jake** — edits `vault/About/Jake.md`
2. **About Hauck Marketing** — edits `vault/About/Hauck Marketing.md`

### Form design — v1, keep it simple

For each subsection: **one big markdown textarea** showing the current note body, plus a save button. That's it. Don't try to parse the markdown into individual fields — Jake can edit the markdown directly. The frontmatter is hidden from the UI (you read/write it but don't show it).

Layout:
```
[About Jake]    [About Hauck Marketing]

┌─ About Jake ────────────────────────────┐
│ (markdown editor — monospace, ~30 rows) │
│                                          │
│ # Jake Hauck                             │
│                                          │
│ ## Who I am                              │
│ - ...                                    │
└──────────────────────────────────────────┘

[Cancel]                  [Save changes]

Last saved: <timestamp from note frontmatter or file mtime if you add one>
```

### Implementation notes

- **Load on mount**: call `api.readAboutNotes(root)`. Identify Jake.md vs Hauck Marketing.md by file stem (`path.endsWith("Jake.md")` etc.) or by `front.subject` (`"jake"` vs `"agency"`).
- **Save**: build the new body from the textarea contents, preserve the original `front` from the loaded note (don't strip it), call `api.writeVaultNote(root, note.path, note.front, body)`.
- **Don't touch frontmatter from the UI**: read it, keep it, pass it back unchanged. The `front` field is open-ended (TypeScript `[key: string]: unknown`) so even unknown keys round-trip.
- **Validation**: bare minimum — disallow empty body. No schema enforcement.
- **No autosave**. Explicit Save button. Show a "dirty" indicator if the textarea differs from loaded.
- **Reuse styling** from existing form components (see `app/src/components/ClientCredentials.tsx` or similar) — don't invent new patterns.

### Out of scope

- Do **not** delete root `CLAUDE.md` yet. Leave it; Jake will verify agents are pulling from the vault first.
- Do **not** add structured fields (separate "How to talk to me" textareas, etc.). Markdown textarea is fine for v1.
- Do **not** add a markdown preview pane. The textarea is enough.
- Do **not** support file uploads, image embeds, or wikilink autocomplete. That's Obsidian's job.

## Acceptance criteria

1. Settings → About loads existing `Jake.md` and `Hauck Marketing.md` content into editable textareas.
2. Editing + Save writes the file. Frontmatter is preserved exactly (verify by reading the file directly after save — `type:`, `subject:`, `client:`, `agent:`, `tags:` still present).
3. Reload the app → edits persist.
4. Open a chat with Aurelius → ask "What are my ad copy rules?" → response reflects current vault content (not the stale root `CLAUDE.md`).
5. `pnpm tsc --noEmit` passes from `app/` with no new errors.
6. `cargo check` passes from `app/src-tauri/` with no new errors.

## Test plan

1. Open the app in dev mode (`pnpm tauri dev` from `app/`).
2. Navigate to Settings → About → About Jake. Confirm the textarea shows the migrated content.
3. Add a line "Test edit YYYY-MM-DD" at the bottom of the body. Save.
4. Open `vault/About/Jake.md` directly in a text editor or Obsidian. Confirm the line is there. Confirm frontmatter is intact at the top.
5. Open ChatDrawer with Aurelius active. Ask: "What's the most recent thing in my About note?" — he should mention the test line.
6. Repeat for About Hauck Marketing.
7. Revert the test edit. Save. Confirm it's gone from disk.

## Files you will likely touch

- `app/src/components/AboutSettings.tsx` — **new**, the form component
- `app/src/App.tsx` — register the view if needed
- `app/src/components/MainDashboard/Sidebar.tsx` — add nav entry if needed
- Possibly `app/src/index.css` or a co-located CSS file for the form styling

## Do not touch

- `vault.rs`, `prompt.ts`, `tauri.ts` — these already do what you need
- The vault folder structure or seeded files (except via the form you're building)
- The migration script at `scripts/migrate_knowledge.py`
- Anything in `media-buying/` — that's the legacy knowledge source, already migrated

## When you're done

Update `MEMORY.md` if you introduced any new architectural decision worth remembering (e.g., where the Settings page lives in the nav). Otherwise no memory update needed.

Report back: what file(s) you created/modified, what the form looks like, and confirmation that the acceptance criteria pass.
