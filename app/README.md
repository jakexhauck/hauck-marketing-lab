# Hauck Marketing Lab — Desktop App

The Tauri desktop shell for J.A.R.V.I.S., wrapping the `media-buying/` folder system.

## Run dev

From `app/`:

```
pnpm tauri dev
```

First launch shows a folder picker — point it at your `media-buying/` folder. The path is saved to Tauri's app config dir; you won't be asked again unless you reset it.

## Build for current OS

```
pnpm tauri build
```

Output lands in `src-tauri/target/release/bundle/`:
- Windows: `msi/*.msi`, `nsis/*.exe`
- macOS: `dmg/*.dmg`, `macos/*.app`

## Architecture (one-screen summary)

- **Source of truth:** `media-buying/` folder. The app reads from it and writes back to `chats/`, `outputs/`. No database.
- **LLM:** `claude -p` subprocess, shelled out from Rust via `tokio::process::Command`. Output streamed via `--output-format stream-json`, parsed as JSONL, emitted to the frontend as Tauri events.
- **Persistence:** Each conversation is a markdown file in `media-buying/chats/YYYY-MM-DD-<slug>.md` with YAML frontmatter. App config (selected folder path) lives in the OS config dir as `config.json`.
- **Sync:** Folder-level via iCloud / OneDrive / Dropbox / git. The app has no sync logic.

## Where to look

| Surface | File |
|---|---|
| Root state, picker → dashboard switch | `src/App.tsx` |
| Status bar | `src/components/StatusBar.tsx` |
| Agent rail (with active "ON CALL" state) | `src/components/AgentRail.tsx` |
| Dashboard composition | `src/components/Dashboard.tsx` |
| Chat drawer with streaming | `src/components/ChatDrawer.tsx` |
| Cmd/Ctrl+K palette (placeholder) | `src/components/CommandPalette.tsx` |
| First-launch folder picker | `src/components/FolderPicker.tsx` |
| Design tokens, CSS classes lifted from mockups | `src/index.css` |
| Tauri command surface (typed) | `src/lib/tauri.ts` |
| Prompt assembly (agent body + history + user) | `src/lib/prompt.ts` |
| Rust: folder parsing | `src-tauri/src/folder.rs` |
| Rust: chat file IO | `src-tauri/src/chat.rs` |
| Rust: claude subprocess streaming | `src-tauri/src/claude.rs` |
| Rust: app config | `src-tauri/src/config.rs` |
| Rust: YAML frontmatter splitter | `src-tauri/src/frontmatter.rs` |

## Reset the picked folder

Delete `config.json` from your OS app-config dir:
- Windows: `%APPDATA%\com.hauckmarketing.lab\config.json`
- macOS: `~/Library/Application Support/com.hauckmarketing.lab/config.json`

Restart the app — the first-launch picker reappears.

## v1 scope and deferrals

This is the **v1 base shell** per `APP-FOUNDATION-PLAN.md`. Hook generator, diagnosis form, knowledge browser, multi-client management, settings, and report builder are deliberately deferred. See `BUILD-NOTES.md` at the project root for the running deviations log.
