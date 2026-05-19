# GHL sub-account provisioner

> Status: Proposed. Highest-leverage operational automation left on the table.
> Effort: ~1 day. Most of the time is the snapshot ID + scope audit, not the code.
> Why this matters: Every new client today = ~30 min of clicking through GHL: create sub-account, apply snapshot, mint a location token, copy it back into the app. Three signings in one week and the snapshot step gets skipped or misapplied. This kills the manual loop.
> Depends on: Activity log (shipped). Agency-level PIT in `ghl_config.json` (already in place).

## What this build replaces

The 6 to 8 clicks per new client across GHL's agency UI:
1. Sub-accounts → + Create New Sub-Account → fill 5 fields → Save.
2. New sub-account → Settings → Load Snapshot → pick "Hauck Default" → confirm.
3. Settings → Private Integrations (per sub-account) → + Create → tick scopes → Save → copy token.
4. Paste token + locationId back into `vault/Clients/<name>/Profile.md`.
5. Verify the snapshot actually loaded (pipelines, calendars, custom fields all present).

All of this is GHL API surface. None of it needs browser automation.

## The API endpoints (all in GHL v2)

| Step | Method | Path | Auth |
|---|---|---|---|
| Create sub-account | `POST` | `/locations/` | Agency PIT, scope `locations.write` |
| Apply default snapshot | `POST` | `/locations/{locationId}/load-snapshot` | Agency PIT, scope `snapshots.readonly` + `locations.write` |
| List snapshots (to find the default ID once) | `GET` | `/snapshots/` | Agency PIT, scope `snapshots.readonly` |
| Mint location-scoped token | `POST` | `/oauth/locationToken` | Agency PIT |
| Verify load complete | `GET` | `/locations/{locationId}` (poll status field) | Location token |

Snapshot loads are async on GHL's side. Poll for completion, do not assume success on 200.

## What "done" looks like

1. **One-time setup in Settings**: a "GHL defaults" panel with:
   - Default snapshot picker (dropdown populated from `GET /snapshots/`).
   - Default timezone (defaults to `America/New_York`).
   - Default sub-account business hours (so the snapshot's calendar honors them).
   Persisted to `vault/About/Hauck Marketing.md` frontmatter (`ghl_default_snapshot_id`, `ghl_default_timezone`).
2. **"Provision GHL sub-account" button** on the Client Hub for any client without a `ghl_location_id`. Visible on the Overview tab.
3. **One click runs the full chain**: create → snapshot apply → poll until done → mint token → write back to `Profile.md`. Total wall time: 20 to 60 sec.
4. **Activity log line per step**: `ghl.subaccount_created`, `ghl.snapshot_applied`, `ghl.location_token_minted`, `ghl.subaccount_provisioned` (final hot: true entry).
5. **Failure recovery**: if snapshot load fails or token mint fails, the sub-account is NOT deleted (manual cleanup). Modal surfaces the GHL error and a "Retry from step N" button.
6. **Smoke output**: a post-provision panel showing locationId, token (masked), snapshot status, pipelines created count, custom fields count. Sanity check before Jake closes the modal.

## Build steps

1. **Rust client**: extend `app/src-tauri/src/ghl.rs` with the four new commands. Each takes the agency PIT from existing config + the input payload. Standard error handling, return typed structs.

2. **Snapshot picker UI**: extend `SettingsPage.tsx` → add a "GHL defaults" section. On open, fetches snapshot list. Stores chosen ID + label.

3. **Provisioner cascade** (`app/src/lib/ghlProvision.ts`):
   ```ts
   export async function provisionSubaccount(client: ClientEntry): Promise<ProvisionResult> {
     // 1. create
     // 2. load snapshot
     // 3. poll until snapshot status === "completed"  (60s timeout)
     // 4. mint location token
     // 5. write back to Profile.md frontmatter
     // 6. logActivity ghl.subaccount_provisioned hot:true
   }
   ```
   Pure orchestration; UI imports + renders progress.

4. **Modal** (`app/src/components/GhlProvisionModal.tsx`): mirrors the Phase1CascadeModal pattern. Five rows, status per row (pending → in_progress → done → error), retry per row, smoke-output panel at the bottom.

5. **Profile.md writeback**: extends existing `buildProfileFront` (or adds a sibling writer) to set `ghl_location_id` and `ghl_location_token`. Token is gitignored content; never committed to the public sync.

6. **Wire into new-client flow**: optional auto-trigger when a client is created with `provision_ghl: true` checked on the new-client form. Default off until Jake is confident in the snapshot.

## Open decisions

- **Snapshot scope audit**: the default snapshot needs to include the calendars + pipelines + custom fields the rest of the app reads. One-time pass to confirm "Hauck Default" snapshot has: Onboarding Call calendar, Onboarding pipeline, the 12 contact custom fields documented in `04 · Stage 1`. If anything is missing, the snapshot itself gets a follow-up edit pass before this ships.
- **Token storage location**: `Profile.md` frontmatter is the proposed home. Alternative: a separate `vault/Clients/<name>/credentials.json` (gitignored) so the public sync never sees the token. Recommend the latter; tokens are write-rarely, read-often.
- **Retry semantics**: if snapshot apply succeeds but token mint fails, retrying token mint is safe (idempotent). Retrying snapshot apply on the same sub-account is also safe (GHL no-ops if the snapshot already loaded). Confirm with one real test before shipping the retry buttons.
- **Per-client snapshot override**: should niche playbooks eventually map to per-niche snapshots? Out of scope for v1; default snapshot only.

## Out of scope

- **Meta Business Manager sub-account creation.** Meta's API for this is partner-only; browser automation is the only path, and that is a separate build.
- **GHL custom widget placement.** UI-only in GHL today.
- **Sub-account deletion / archival.** Manual via GHL UI; rarely needed.
- **Reverse sync** (read every GHL sub-account on app start and surface unprovisioned ones). Nice to have, not v1.
- **Snapshot version diffing.** When the default snapshot gets a new version, no auto-reapply to existing sub-accounts.

## Effort + leverage

- ~1 day end to end.
- Per-new-client savings: ~30 min of manual clicking, plus zero risk of forgetting the snapshot step.
- Multiplies with the Day-0 cascade: when "Mark client Won" triggers the cascade, this should run as step 0 so the sub-account exists before the welcome email + intake form share need a location token.

## Why this is in Priority, not back burner

The Day-0 cascade (Stage 2 of 04) already drafts welcome emails, contracts, and calendar invites for new clients. Without this, the very first thing Jake does after clicking "Approve all" in that cascade is hand-create a GHL sub-account and copy a token. This closes the loop that the cascade left open. Highest-leverage operational automation remaining.
