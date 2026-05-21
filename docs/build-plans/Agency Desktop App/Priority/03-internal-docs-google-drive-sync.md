# 03 — Internal Documents + Google Drive Push

## Goal

A persistent, per-client document system inside the Hauck Marketing Lab app. Generated copy, briefs, notes, and reports live as markdown in the vault. One click converts each doc into a native Google Doc inside the correct subfolder of the client's Drive workspace. Native Google Doc, not `.docx`. Edit history, comments, and the docs.google.com editor all work.

## Decisions (locked 2026-05-21)

| Decision | Choice |
|---|---|
| Sync model | Click-to-push only. No auto-watcher in v1. |
| Update behavior | **Option B**: direct Drive REST API delete from Rust after each successful re-push. Old version removed, new version takes its place under the same logical title. One re-consent prompt the first time. Drive API is free. |
| UI placement | Both: a Documents tab inside Client Hub, plus a global Documents page in the sidebar. |
| Output format on Drive | Native Google Doc (`application/vnd.google-apps.document`). NEVER `.docx`. |
| Source format in vault | Markdown with YAML frontmatter. Folder = source of truth. |
| Folder targeting | Per-client default per `kind`, configured in the app, stored on the client record in `clients.yaml`. Overridable per-doc via folder picker. |
| First form to integrate | Ad Copy. Others follow once the pattern is proven. |

## What already exists

We are not starting from zero. Inventory:

- `app/src-tauri/src/drive_upload.rs` — Tauri command `upload_output_to_drive(root, client_slug, output_path, filename)`. Spawns `claude -p`, sends a prompt that:
  1. Reformats the markdown body into clean semantic HTML.
  2. Calls `mcp__claude_ai_Google_Drive__create_file` with `content_mime_type: text/html` and target `mimeType: application/vnd.google-apps.document`. This triggers Drive's server-side conversion to a real Google Doc.
  3. Emits a `DOC_URL: ...` sentinel on the final line.
  4. Rust parses the sentinel and returns `{ doc_url, doc_id, filename }`.
- `app/src-tauri/src/drive_index.rs` — reads `vault/Clients/<Name>/_drive-index.md` with cached subfolder IDs (Assets / Creatives / Notes / Onboarding / Reports).
- `app/src/lib/driveIndex.ts` — frontend parser for the same file.
- `vault/Clients/<Name>/Profile.md` and `vault/Clients/<Name>/_drive-index.md` are already in place for every client.
- Google OAuth (Calendar) is wired with refresh-token storage at `app_config_dir/google_calendar_tokens.json`. Scopes: `calendar.events`, `calendar.readonly`.

What is **not** built yet:

- A persistent `Docs/` folder per client.
- Frontmatter sync-state tracking.
- Subfolder targeting (current `upload_output_to_drive` only pushes to the client's *root* Drive folder, ignoring subfolders).
- An update path (currently every push creates a new Doc, full stop).
- A "Pull from Drive" path.
- Any UI surface beyond the inline form-output upload button.

## The MCP delete constraint

The Google Drive MCP exposes exactly these tools:

`create_file`, `copy_file`, `read_file_content`, `download_file_content`, `get_file_metadata`, `get_file_permissions`, `search_files`, `list_recent_files`.

Missing: **no delete, no trash, no move, no rename, no update-content.**

This kills the original "delete + recreate" plan that you locked earlier today. Two honest options:

### Option A (recommended for v1) — Append-on-version

Each push creates a new Google Doc with a version suffix in the title:

```
Willis Windows — Learning Phase Ad Copy
Willis Windows — Learning Phase Ad Copy (v2)
Willis Windows — Learning Phase Ad Copy (v3)
```

Frontmatter tracks `current_drive_file_id`. Older Doc IDs are appended to a `previous_versions` array in the same frontmatter. Old versions remain visible in the Drive folder until manually deleted.

Pros: pure MCP, ships fast, zero OAuth surface change, no risk of accidental Drive deletion.
Cons: clutter accumulates in the Drive folder. Acceptable when each doc is pushed a handful of times.

### Option B — Add a direct-API delete helper in Rust (selected)

Extend the existing Google OAuth flow to include `https://www.googleapis.com/auth/drive.file` (the narrower per-file scope, NOT the broad `drive` scope; `drive.file` only grants access to files this app created or that the user explicitly opens with it, which is exactly what we want). Add a single Tauri command `drive_delete_file(file_id)` that fires a `DELETE https://www.googleapis.com/drive/v3/files/{id}` using the stored refresh token.

Cost: zero. Drive API is free up to ~1B queries/day project-wide. We will use one delete per re-push.

Triggered immediately after a successful push to clean up the prior version. If delete fails (file gone, permission revoked, network error), the new Doc is already created and frontmatter is already updated; we surface a non-fatal warning toast and stash the orphaned file ID in `previous_versions.unswept[]` so a "Sweep orphans" command can retry later.

Flow on push:
1. Create new Doc via MCP (existing path).
2. Parse new `current_drive_file_id`.
3. If old `current_drive_file_id` exists, call `drive_delete_file(old_id)` via the new Rust helper.
4. On success: clear the old entry. On failure: append to `previous_versions.unswept`.
5. Update frontmatter atomically.

User experience: first push triggers a Google consent screen requesting the new Drive scope alongside the existing Calendar ones. Subsequent pushes are silent.

## Storage model

### Filesystem layout

```
vault/Clients/<Client Name>/Docs/
    <kind>-<slug>.md            # one markdown file per logical document
    .registry.json              # optional cache; not source of truth
```

`<kind>` is one of: `ad-copy`, `brief`, `notes`, `report`, `other`.
`<slug>` is a kebab-case slug derived from the title. Collisions append `-2`, `-3`, etc.

### Frontmatter schema

```yaml
---
id: "doc_2026-05-21_a1b2c3"          # stable internal ID, never changes
title: "Willis Windows — Learning Phase Ad Copy"
kind: ad-copy                         # ad-copy | brief | notes | report | other
client_slug: willis-windows           # cross-checked against parent folder
created_at: "2026-05-21T14:30:00Z"
updated_at: "2026-05-21T14:42:11Z"

# Drive targeting (filled when user picks a subfolder; defaults applied per kind)
drive_folder_id: "1tvCE12-NoGTAYgc7QR9OVHqvw0H8m-xq"
drive_folder_name: "Creatives"

# Sync state (null until first push)
current_drive_file_id: null
current_drive_url: null
current_version: 0                    # 0 = never pushed
synced_at: null                       # last successful push timestamp
synced_content_hash: null             # sha256 of body at push time; drives the dirty indicator

# History
previous_versions:
  - drive_file_id: "1abc..."
    drive_url: "https://docs.google.com/document/d/1abc.../edit"
    pushed_at: "2026-05-20T11:00:00Z"
    version: 1
---

# Body content (CommonMark markdown)
```

The `id` field is the canonical local identifier. Filename and slug can change without breaking references. The frontend keys list rows on `id`.

### Per-client folder-per-kind mapping

Folder defaults are configured **per client**, not globally. Stored on the client record in `clients.yaml`:

```yaml
clients:
  - slug: willis-windows
    name: Willis Windows
    drive_folder_url: "https://drive.google.com/drive/folders/1hgGRDyEJ9..."
    doc_folder_defaults:
      ad-copy:    { id: "1tvCE12-...", name: "Creatives" }
      brief:      { id: "1wAeX5jr5...", name: "Notes" }
      notes:      { id: "1wAeX5jr5...", name: "Notes" }
      report:     { id: "18Ufv9lPO...", name: "Reports" }
      other:      { id: "1wAeX5jr5...", name: "Notes" }
```

On first push for a client where `doc_folder_defaults` is not yet set, the UI prompts a one-time setup card at the top of the Documents tab: "Pick the default folder for each kind of document for this client." Pre-populated with a sensible suggestion (matching the table below) that the user can accept or change. After save, that card collapses into a small "Edit folder defaults" link.

Fallback suggestion when no client config exists:

| `kind` | Suggested subfolder |
|---|---|
| `ad-copy` | Creatives |
| `brief` | Notes |
| `notes` | Notes |
| `report` | Reports |
| `other` | Notes |

Resolution order at push time, highest priority first:
1. Per-doc override (`drive_folder_id` in the doc's frontmatter, set via folder picker on the editor).
2. Client's `doc_folder_defaults[kind]` from `clients.yaml`.
3. Client's root `drive_folder_url` (final fallback if no defaults set).

### Dirty detection

A doc is "dirty" (has unpushed local changes) when:

```
sha256(current body) != frontmatter.synced_content_hash
```

If `synced_content_hash` is null, the doc is always dirty (never pushed). The UI shows the dirty state as a small dot on the row and disables the "Open in Docs" button when dirty if the user prefers (toggleable in settings, default off).

### File watcher (not in v1, design now for later)

If we add auto-push later, the watcher uses the existing pattern from `app/src-tauri/src/watcher.rs`. Debounce 5 seconds on any `vault/Clients/*/Docs/*.md` write. Skip files where `current_version > 0 && dirty == false` (already in sync).

## Backend (Tauri Rust)

### New file: `app/src-tauri/src/client_docs.rs`

Pure-Rust frontmatter and filesystem layer. No Drive calls.

Commands:

```rust
#[tauri::command] fn list_client_docs(root: String, client_slug: String) -> Result<Vec<DocSummary>, String>;
#[tauri::command] fn list_all_docs(root: String) -> Result<Vec<DocSummaryWithClient>, String>;
#[tauri::command] fn read_client_doc(root: String, client_slug: String, doc_id: String) -> Result<ClientDoc, String>;
#[tauri::command] fn create_client_doc(root: String, client_slug: String, payload: CreateDocPayload) -> Result<ClientDoc, String>;
#[tauri::command] fn update_client_doc_body(root: String, client_slug: String, doc_id: String, body: String) -> Result<ClientDoc, String>;
#[tauri::command] fn rename_client_doc(root: String, client_slug: String, doc_id: String, new_title: String) -> Result<ClientDoc, String>;
#[tauri::command] fn set_client_doc_target_folder(root: String, client_slug: String, doc_id: String, folder_id: String, folder_name: String) -> Result<ClientDoc, String>;
#[tauri::command] fn delete_client_doc(root: String, client_slug: String, doc_id: String, also_purge_drive: bool) -> Result<(), String>;
```

Shapes:

```rust
pub struct DocSummary {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub created_at: String,
    pub updated_at: String,
    pub synced_at: Option<String>,
    pub current_drive_url: Option<String>,
    pub current_version: u32,
    pub is_dirty: bool,
    pub drive_folder_name: Option<String>,
}

pub struct ClientDoc {
    pub summary: DocSummary,
    pub body: String,
    pub frontmatter_raw: serde_yaml::Value,  // full frontmatter for round-trip
}

pub struct CreateDocPayload {
    pub title: String,
    pub kind: String,
    pub body: Option<String>,             // optional starter content
    pub drive_folder_id: Option<String>,  // if omitted, applies default per kind
    pub drive_folder_name: Option<String>,
}
```

Implementation notes:
- Reuse `app/src-tauri/src/frontmatter.rs` (already exists for other vault notes).
- `synced_content_hash` recomputed every read so the UI never lies about dirtiness, even if the frontmatter copy gets stale.
- All writes are atomic: write to `<file>.tmp`, then `rename`.
- `also_purge_drive: true` is a placeholder that returns `Ok(())` in v1; wired up when Option B (direct delete) lands.

### Extend `drive_upload.rs` for the doc system

Add a new command alongside the existing `upload_output_to_drive`:

```rust
#[tauri::command] async fn push_client_doc_to_drive(
    root: String,
    client_slug: String,
    doc_id: String,
) -> Result<DocSummary, String>;
```

Behaviour:

1. Read `<vault>/Clients/<Name>/Docs/<file>.md`.
2. Resolve target folder ID. Priority: frontmatter `drive_folder_id` > default mapping for `kind` (resolved against `_drive-index.md`) > client root folder URL.
3. Reuse the existing semantic-HTML prompt from `upload_output_to_drive`, but:
   - Use the resolved subfolder ID instead of the client root.
   - Use the doc's title unchanged (no `(v2)` suffix — Option B deletes the old Doc so titles stay stable).
   - Append explicit instructions: "Do not query, list, or modify any other files in the folder. Only create one new file with the title and content provided."
4. Parse `DOC_URL:` sentinel. Compute new `doc_id`.
5. If a previous `current_drive_file_id` exists, call the new Rust helper `drive_delete_file(old_id)`:
   - On success: do nothing further with the old ID.
   - On failure (404, 403, network): log a non-fatal warning, append the old ID + reason to `previous_versions.unswept[]` in frontmatter.
6. Update the markdown frontmatter atomically:
   - Move previous `current_*` fields into a new entry at the head of `previous_versions` (with `swept: true|false`).
   - Set `current_drive_file_id`, `current_drive_url`, `current_version += 1`, `synced_at = now`, `synced_content_hash = sha256(body)`.
7. Return the fresh `DocSummary` so the UI can re-render without a separate read.

Failure modes the prompt must handle:
- MCP not authenticated → friendly error surface; prompt the user to run `claude /mcp` and re-auth.
- Target folder ID returns 404 → suggest refreshing `_drive-index.md`.
- Body exceeds size limit (Google Doc import cap is ~50MB HTML, so practically unhittable here) → still report cleanly.
- `claude -p` exits nonzero → surface stderr verbatim, do not mutate frontmatter.

The function is idempotent on **failure**: frontmatter is only updated after a successful sentinel parse. On retry the user gets a clean attempt.

### Pull-from-Drive command

```rust
#[tauri::command] async fn pull_client_doc_from_drive(
    root: String,
    client_slug: String,
    doc_id: String,
    create_backup: bool,
) -> Result<ClientDoc, String>;
```

Behaviour:

1. Read frontmatter. Require `current_drive_file_id`. Error if null ("nothing to pull").
2. Spawn `claude -p` with a prompt that calls `mcp__claude_ai_Google_Drive__read_file_content` against the file ID and emits the body between `<BODY_START>` and `<BODY_END>` sentinels.
3. If `create_backup`, write current local body to `Docs/.backup/<doc_id>-<timestamp>.md` before overwriting.
4. Replace the markdown body, update `synced_at` and `synced_content_hash`. Title and frontmatter stay; we trust the local title.
5. Return refreshed `ClientDoc`.

Note: Google Docs to markdown is lossy in the other direction. We accept that for v1. Users who edit heavily in Docs and pull back should be warned via a one-time modal: "Pulling overwrites your local copy. Formatting may simplify."

## Frontend (TypeScript/React)

### New lib: `app/src/lib/clientDocs.ts`

Thin wrapper around the Tauri commands. Types match the Rust shapes above. Exposes:

```ts
export async function listClientDocs(clientSlug: string): Promise<DocSummary[]>
export async function listAllDocs(): Promise<DocSummaryWithClient[]>
export async function readClientDoc(clientSlug: string, docId: string): Promise<ClientDoc>
export async function createClientDoc(clientSlug: string, payload: CreateDocPayload): Promise<ClientDoc>
export async function updateClientDocBody(clientSlug: string, docId: string, body: string): Promise<ClientDoc>
export async function renameClientDoc(clientSlug: string, docId: string, newTitle: string): Promise<ClientDoc>
export async function setClientDocTargetFolder(clientSlug: string, docId: string, folder: { id: string; name: string }): Promise<ClientDoc>
export async function pushClientDocToDrive(clientSlug: string, docId: string): Promise<DocSummary>
export async function pullClientDocFromDrive(clientSlug: string, docId: string, createBackup: boolean): Promise<ClientDoc>
export async function deleteClientDoc(clientSlug: string, docId: string, opts?: { alsoPurgeDrive?: boolean }): Promise<void>
```

### New component: `app/src/components/DocumentEditor.tsx`

Reused by both the per-client tab and the global page.

Layout:

```
+---------------------------------------------------------------+
|  [Title input]                       [kind ▾] [folder ▾]      |
|  Last synced: 2 min ago • v3 • dirty                          |
+---------------------------------------------------------------+
|                                                               |
|  [Markdown editor — left half]    [Live preview — right half] |
|                                                               |
+---------------------------------------------------------------+
|  [Push to Drive]  [Open in Docs]  [Pull from Drive]  [Delete] |
+---------------------------------------------------------------+
```

Editor behaviour:
- Auto-saves the body to disk on a 1-second debounce. Local save is always fast and offline.
- "Push to Drive" disabled while saving, while pushing, or if title is empty.
- "Open in Docs" disabled until `current_drive_url` exists.
- "Pull from Drive" disabled until first push; on click opens a confirm modal that defaults `create_backup: true`.
- Folder picker reads `_drive-index.md` for the client. If empty, shows "Root folder" only.

Status states (chip in header):
- `unsynced` — never pushed. Grey.
- `synced` — pushed, body matches `synced_content_hash`. Green.
- `dirty` — pushed previously, body has changed since. Amber.
- `pushing` — request in flight. Spinner.
- `error` — last push failed. Red; clicking shows the error.

### New page: `app/src/components/MainDashboard/pages/ClientDocuments.tsx`

Rendered inside Client Hub as a tab next to Profile / Onboarding / Ads.

Layout: master/detail. Left rail lists docs grouped by `kind` with status chips. Right pane renders `DocumentEditor` for the selected doc, or a "New Document" form.

"New Document" defaults: title empty, kind selector defaulting to `ad-copy`, body empty (or accepts a starter passed in via navigation state, used by form integration).

### New page: `app/src/components/MainDashboard/DocumentsPage.tsx`

Sidebar entry "Documents" (global, not client-scoped).

Layout: table of all docs across all clients. Columns: client, title, kind, status, last synced, Drive folder. Filters: client multi-select, kind multi-select, status multi-select, search by title. Row click navigates to that doc's editor inside the client's tab (deep-link).

### Sidebar wiring

`app/src/components/MainDashboard/AppSidebar.tsx` adds a "Documents" entry between "Clients" and "SOPs". `app/src/lib/navigation.ts` gets a `documents` route.

### Form integration: Ad Copy

`GenericFormGenerator.tsx` already supports custom output handlers. Add a "Save as Document" output mode for any form with `outputKind: "ad-copy"` (Ad Copy form gets this first). On submit:

1. Run the existing form prompt.
2. Capture the output body.
3. Call `createClientDoc({ title: <derived from form fields>, kind: "ad-copy", body: <output>, drive_folder_id: <default per kind> })`.
4. Navigate to the new doc's editor with the body already loaded. User reviews and clicks "Push to Drive" when ready.

Same hook applies later to Brief / Report forms; out of scope for v1 unless trivially free.

## Edge cases and explicit behaviour

| Case | v1 behaviour |
|---|---|
| User clicks "Push" twice in 1 second | Second click no-op while first is in flight (button disabled). |
| `claude -p` times out (no response in 90s) | Surface "Push timed out. Try again." Do not mutate frontmatter. |
| MCP auth expired | Surface "Google Drive sign-in needed. Run /mcp in your Claude Code session and reconnect." Link opens docs. |
| Target folder ID is stale (Drive returned 404) | "Drive folder not found. Refresh client Drive index?" CTA runs `refresh_drive_index`. |
| Two clients have the same doc title | No collision: each lives in its own client folder. Drive titles can collide across folders; that's fine. |
| User renames doc locally after push | Title changes locally. Drive Doc keeps its old title until next push. We do NOT try to rename the Drive Doc (MCP can't anyway). |
| User edits doc, pushes, then realises they wanted to revert | "Pull from Drive" reads back the version they just pushed; or they restore from `Docs/.backup/`. Local backup is created on pull, not on push, since the source of truth is local. |
| Doc body is empty | "Push" disabled with tooltip "Document is empty." |
| User deletes doc locally | Local file removed. `previous_versions` Drive docs and `current` Drive doc remain. v1 prompts: "Also remove from Drive?" but the v1 implementation only logs intent; actual purge ships with Option B. |
| Special characters in title | Sanitised via existing `sanitize_filename` in `drive_upload.rs`. Slash, colon, quote, etc. become hyphens. |
| Markdown contains image refs | Inline images via HTML `<img src="...">` work if src is a public URL. Local image refs (`![alt](./img.png)`) are silently dropped on push with a non-fatal warning in the editor. |

## Markdown → Google Doc fidelity smoke test

Before committing the form integration, run this content through `push_client_doc_to_drive` against a throwaway folder and visually verify each element renders:

- H1, H2, H3
- Paragraph with **bold**, *italic*, `inline code`, and a [link](https://example.com)
- Bulleted list, two levels
- Numbered list
- A 3-column table with a header row
- A code block (will render as monospace paragraph; that is acceptable)
- A blockquote (renders as indented quote in Docs)

Document the result in the PR description. Anything that fails to render gets a row in this table:

| Markdown construct | Renders in Doc? | v1 action |
|---|---|---|

## Security / scope hygiene

- All FS writes are scoped under `<vault>/Clients/<slug>/Docs/`. Path canonicalisation rejects `..` traversal.
- The `claude -p` prompt explicitly forbids modifying anything in the target Drive folder other than the new file. This is belt-and-braces; MCP can't delete or move anyway, but if it gains those tools later we have a guardrail in the prompt.
- One new OAuth scope: `https://www.googleapis.com/auth/drive.file`. This is the narrow per-file scope; it grants access only to files this app creates or that the user explicitly opens with it. It does NOT grant access to the user's entire Drive. First push triggers a one-time consent prompt.
- The semantic-HTML prompt strips `<script>`, `<style>`, `<link>`, `<iframe>` already (existing behaviour from `drive_upload.rs`). Keep that.

## Out of scope (v1)

- Auto-push on save (file watcher integration).
- Direct Drive API move / rename. Only delete is added in v1; rename and move are not needed since we delete-and-recreate on every update.
- Bidirectional live sync.
- Real-time multi-user editing.
- Doc templates / boilerplate library.
- Comments / threads inside the in-app editor.
- Pulling Google Doc revision history into the vault.
- Bulk push ("push all dirty docs for this client").
- Cross-client default folder presets (defaults are per-client; no global defaults UI).

## Build order

Each item lands as its own commit with a runnable mid-state where possible.

1. **Frontmatter layer (Rust)** — `client_docs.rs` with `list_*`, `read_*`, `create_*`, `update_*`, `rename_*`, `set_target_folder`, `delete_*`. Unit-tested against a temp dir. No UI yet.
2. **Frontend lib + per-client list** — `clientDocs.ts`, `ClientDocuments.tsx` with the master/detail layout. Create / rename / edit / delete docs locally. No Drive yet. Save-on-debounce works.
3. **Per-client folder defaults UI** — `doc_folder_defaults` field on the client record in `clients.yaml`. Setup card at the top of the Documents tab. Folder picker reads `_drive-index.md`. Edit-defaults link once set.
4. **Push to Drive (first push, no delete yet)** — extend `drive_upload.rs` with `push_client_doc_to_drive`. Resolve target folder via the defaults chain. Wire button in `DocumentEditor`. Manual test against Willis Windows Creatives folder. Confirm Doc appears, frontmatter updates, "Open in Docs" works.
5. **OAuth scope expansion + Rust delete helper** — add `drive.file` to the existing Google OAuth flow. New file `app/src-tauri/src/drive_api.rs` with `drive_delete_file(file_id)`. Re-consent test on a clean machine. Verified by manually deleting a test Doc via the helper.
6. **Update path with delete** — wire `drive_delete_file` into `push_client_doc_to_drive`. After successful new-Doc create, delete the old one. Failure path appends to `previous_versions.unswept`. UI shows orphan count if non-zero.
7. **Pull from Drive** — `pull_client_doc_from_drive` with backup-to-`.backup/`. Confirm modal in UI.
8. **Global Documents page** — `DocumentsPage.tsx` and sidebar entry. Table + filters. Deep-link to per-client editor.
9. **Ad Copy form integration** — "Save as Document" output mode. Verify the round-trip from form to doc to Drive. Default folder applied from `doc_folder_defaults.ad-copy`.
10. **Polish** — empty states, error toasts, status chip animations, copy review on all confirm modals, "Sweep orphans" command for `previous_versions.unswept`.

## Risks and open questions

- **Semantic HTML drift.** The existing `drive_upload.rs` prompt assumes the agent reliably produces clean HTML. If the model occasionally emits inline styles or extra wrapper tags, the Doc still renders but looks off. Mitigation: keep the prompt strict and run the smoke test on a sample of doc types before form integration.
- **Multiple clients across machines.** With the GitHub-synced vault, two machines could create the same `id` on different clients simultaneously. Probability is tiny (you're solo right now) but worth noting; resolve later by namespacing IDs by machine.
- **`(v2)` clutter in Drive.** Acceptable in v1 because most docs get pushed once or twice. If a client ends up with `(v15)` of anything we'll fast-track Option B.
- **Naming convention drift.** If you decide ad copy belongs in Notes for some clients but Creatives for others, the per-kind default needs to be overrideable per-client. Out of scope for v1; folder picker handles the case manually.
- **What if you do want auto-push later?** Hook is in place: the existing `watcher.rs` plus a debounced call to `pushClientDocToDrive` on any clean-state-to-dirty transition. Maybe 1 day of work when we decide.

## Done definition

- A new doc can be created in the per-client Documents tab and edited offline.
- Clicking "Push to Drive" creates a native Google Doc in the chosen subfolder (Creatives by default for ad-copy).
- The Doc opens in docs.google.com and shows as a Google Doc icon in Drive.
- Re-pushing creates `(v2)`, `(v3)`, etc., and frontmatter `previous_versions` tracks every prior push.
- "Pull from Drive" restores the latest server-side body locally, with a backup of the previous local copy in `Docs/.backup/`.
- Global Documents page lists all docs across all clients with working filters.
- Ad Copy form's "Save as Document" output lands the result in the client's Documents tab, pre-targeted at the Creatives subfolder.
- Markdown fidelity smoke test results documented in the PR.
