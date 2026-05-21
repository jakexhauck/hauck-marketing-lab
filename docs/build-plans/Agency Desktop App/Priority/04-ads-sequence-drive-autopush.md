# 04 — Ads Sequence Artifacts → Google Drive Auto-Push

## Goal

Every artifact the Ads Sequence wizard produces lands in the right Google Drive
subfolder for the active client, automatically, the moment the user clicks Save.
Text outputs become native Google Docs via the existing `push_client_doc_to_drive`
pipeline. Binary outputs (PNG ad creatives, rasterized campaign tree) upload
natively via a new `drive_api` binary-upload helper. Per-step folder targets are
configurable per-client and overridable per-push.

## Decisions (locked 2026-05-21)

| Decision | Choice |
|---|---|
| Push timing | Auto-push on every Save. No second click. |
| Failure mode | Save still succeeds locally. Toast surfaces Drive error. Manual retry via the new Drive pill on the rail card. |
| Folder targeting | Per-client default per *step*. Override per-push for binaries (PNGs + tree snapshot). |
| Binary uploads | Native (NOT wrapped in a Google Doc). PNG stays a PNG in Drive. |
| Configurator UI | Gear button on Ads Sequence wizard topbar → modal lists every step with a folder picker. Sourced from `_drive-index.md` for the client. |

## What flows where

| # | Step ID | Output type | Drive form | Default subfolder |
|---|---|---|---|---|
| 1 | `audience-research` | Markdown body | Google Doc | Notes |
| 2 | `creative-brief` | Markdown body | Google Doc | Notes |
| 3 | `hooks` | JSON-in-markdown | Google Doc (full body) | Creatives |
| 4 | `ad-copy` | Markdown body | Google Doc | Creatives |
| 5 | `ad-creative` | PNG files | Native PNG | Creatives |
| 6 | `structure` (campaign tree snapshot) | PNG | Native PNG | Creatives |
| 7 | `optimizer` | JSON-in-markdown | Google Doc | Notes |

The defaults are *suggestions* applied on first-run; Jake can rewire any step to
any subfolder per-client.

## Data model

### `clients.yaml`

Add a new optional field on each client record. Keyed by sequence step ID. Each
entry is the same `{ id, name }` shape as `doc_folder_defaults`.

```yaml
clients:
  - slug: willis-windows
    sequence_folder_defaults:
      audience-research: { id: "...", name: "Notes" }
      creative-brief:    { id: "...", name: "Notes" }
      hooks:             { id: "...", name: "Creatives" }
      ad-copy:           { id: "...", name: "Creatives" }
      ad-creative:       { id: "...", name: "Creatives" }
      structure:         { id: "...", name: "Creatives" }
      optimizer:         { id: "...", name: "Notes" }
```

### `SequenceStepRecord`

Extend the persisted record so the rail can show a "Open in Drive" pill and
report sync failures without a re-read.

```ts
interface SequenceStepRecord {
  path: string;
  completedAt: string;
  driveUrl?: string;           // most recent successful push
  driveFileId?: string;
  drivePushAt?: string;
  drivePushError?: string;     // last failure; cleared on success
}
```

## Backend (Rust)

### `clients.rs`
- Add `SequenceFolderDefaults` struct keyed by step id (one field per step,
  same shape as `DocFolderDefaults`).
- Add `sequence_folder_defaults: Option<SequenceFolderDefaults>` to `ClientEntry`.

### `drive_api.rs`
- New helper `create_drive_file_binary(app, parent_folder_id, filename, mime_type, bytes)`.
  Multipart upload, NO `mimeType: application/vnd.google-apps.document` metadata
  override — Drive keeps the original PNG/whatever.
- New Tauri command `upload_binary_to_drive(folder_id, filename, base64_bytes, mime_type) -> { fileId, webViewLink }`.

### `drive_upload.rs`
- New Tauri command `push_sequence_step_to_drive(root, client_slug, step_id, vault_path, title, folder_override) -> SequencePushResult`.
  - Reads the vault note at `vault_path`.
  - Resolves target folder: explicit override > `sequence_folder_defaults[step_id]` > `doc_folder_defaults[kind]` (mapped from step) > client root.
  - Creates a one-shot client doc (kind mapped from step) and pushes via the
    existing pipeline. The doc lives in `vault/Clients/<Name>/Docs/` like any
    other.
  - Returns `{ driveUrl, driveFileId, docId }`.

## Frontend (TypeScript / React)

### `mediaBuyingSequence.ts`
- Extend `SequenceStepRecord` with the Drive fields above.

### `AdsSequenceWizard.tsx`
- After every save (including binary steps), call the appropriate push command.
  On success: write Drive fields into the step record and toast "Pushed to <Folder>".
  On failure: write `drivePushError`, toast the error with a "Retry" action.
- Rail card gains a small "Drive ✓" pill when `driveUrl` is set, linking out.
  On error, pill turns amber with the error tooltip and a retry button.
- Topbar gets a gear button "Drive folders" that opens a modal listing every
  step with a folder picker. Picker source: `_drive-index.md` for the client
  (via existing `parseDriveFolders`). Save persists to `clients.yaml`
  `sequence_folder_defaults`.

### `AdCreativeStudio.tsx`
- For each saved PNG, add a "Push to Drive" button. Defaults to
  `sequence_folder_defaults["ad-creative"]`. Per-push folder picker available
  via a small caret next to the button.
- Bulk "Push all to Drive" at the bottom.

### `CampaignTreeView.tsx`
- New "Snapshot to Drive" button. Rasterizes the rendered tree (SVG → canvas →
  blob), base64-encodes, calls `uploadBinaryToDrive`. Uses
  `sequence_folder_defaults["structure"]` by default, with per-push folder picker.
- Also marks the `structure` step as "done with Drive snapshot" by writing
  `driveUrl` into the structure step record.

## Build order

Each item is its own commit with a runnable mid-state.

1. **Data layer** — extend `clients.rs` with `sequence_folder_defaults`,
   `SequenceStepRecord` with Drive fields, types in `types.ts`. No behaviour
   change yet; field round-trips cleanly to YAML.
2. **Folder configurator UI** — gear modal in the wizard topbar. Persists to
   `clients.yaml`. No push behaviour yet — sets up the targeting layer.
3. **Auto-push text steps** — `push_sequence_step_to_drive` Rust command +
   `handleSaved` wiring + rail pill. Test with audience-research and ad-copy.
4. **Binary upload helper** — `create_drive_file_binary` + `upload_binary_to_drive`
   Tauri command. Manual test via devtools console first.
5. **Ad creatives push** — per-PNG button + bulk push in `AdCreativeStudio`.
6. **Campaign tree snapshot** — SVG → PNG → upload from `CampaignTreeView`.
7. **Polish** — failure retry on the rail pill, empty-state messages when a
   step has no folder configured, toast wording pass.

## Done definition

- Completing any of the 7 sequence steps automatically pushes its artifact to
  the configured Drive subfolder.
- The rail card shows a green "Drive" pill linking to the live Doc or PNG.
- Each step's folder is configurable per-client via the gear modal.
- Binary artifacts (PNG creatives, campaign tree snapshot) upload as native
  PNGs, not wrapped in Google Docs.
- A failed push surfaces inline on the rail card with a one-click retry; the
  local save is never blocked by Drive errors.
