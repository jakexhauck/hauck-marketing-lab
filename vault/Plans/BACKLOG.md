---
type: plan
title: "Backlog — Hauck Marketing Lab App"
status: draft
tags: [plan, idea]
plan_kind: idea
created: "2026-05-29T20:35:38.000Z"
source: "docs/build-plans/BACKLOG.md"
---

# Backlog — Hauck Marketing Lab App

> **Purpose:** Living menu of features deferred from v1. Pick one, hand it to Claude, ship it. Nothing here is committed work — these are options, not promises.
>
> **Order:** Items are loosely grouped by category, not priority. Priority is yours.
>
> **Format:** Each item has a one-line summary, why-it-was-deferred, rough size, and where in the codebase it'll touch. Check the box when shipped.

---

## Polish / quality-of-life

Small wins that improve the daily-use feel without changing scope.

- [ ] **Mac build + cross-platform verification**
  - **What:** Run `pnpm tauri build` on Mac, install `.dmg`, complete Phase 5 of `BUILD-CHECKLIST.md` (cross-platform sanity), test iCloud/OneDrive round-trip per Phase 6.
  - **Why deferred:** v1 was built on Windows; Mac verification is a separate machine session.
  - **Size:** S — assuming no platform surprises.
  - **Touches:** Build only, no code (unless something breaks).

- [ ] **Rename-pass for generic placeholders in content**
  - **What:** Many `media-buying/` files reference "Your Agency", "CMO", "COO", "CSO" — boilerplate from the original template. Replace with Hauck Marketing's actuals.
  - **Why deferred:** Content edit, not app work. Flagged in `APP-FOUNDATION-PLAN.md` § Known Mismatches.
  - **Size:** S/M depending on how thorough.
  - **Touches:** Files under `media-buying/` only.

- [ ] **Markdown rendering in message bodies**
  - **What:** v1 renders message bodies as plain text with `white-space: pre-wrap`. Render markdown (bold, lists, inline code, code blocks) for nicer agent responses.
  - **Why deferred:** Plain text was fine for v1 functional verification.
  - **Size:** S — drop in `react-markdown` or similar, style to match `index.css`.
  - **Touches:** `app/src/components/ChatDrawer.tsx`.

- [ ] **Structured findings inset rendering**
  - **What:** When an agent response includes a structured findings block (the `mockups/chat-final.html` "Zenith findings" inset), render it as the nested panel with severity dots — not plain text.
  - **Why deferred:** Needed a way to mark findings in agent output. Could be: (a) ask agents to emit a fenced block, (b) parse list patterns, (c) explicit `<finding>` tags in agent persona prompts.
  - **Size:** M.
  - **Touches:** `app/src/components/ChatDrawer.tsx` + new `Findings.tsx` component.

- [ ] **Streaming reconnection / error recovery**
  - **What:** If `claude -p` crashes mid-stream, current behavior shows an error message. Better: offer a "retry" button that re-sends the same prompt without losing the user turn.
  - **Why deferred:** Happy path works; error UX is polish.
  - **Size:** S.
  - **Touches:** `app/src/components/ChatDrawer.tsx`, `app/src-tauri/src/claude.rs`.

- [ ] **Window position and size persistence**
  - **What:** Remember window size/position between launches. Tauri has a plugin for this.
  - **Why deferred:** Trivial QoL.
  - **Size:** S — add `tauri-plugin-window-state`.
  - **Touches:** `app/src-tauri/Cargo.toml`, `app/src-tauri/src/lib.rs`.

- [ ] **App icon + branding**
  - **What:** v1 uses Tauri default icons. Replace with a Hauck Marketing / J.A.R.V.I.S. icon set (copper hex on charcoal would suit the aesthetic).
  - **Why deferred:** Icons don't block functionality.
  - **Size:** S — generate icons from a single 1024×1024 PNG via Tauri's icon generator.
  - **Touches:** `app/src-tauri/icons/*`.

- [ ] **Permissions tightening for production build**
  - **What:** v1 `capabilities/default.json` grants `core:default`, `opener:default`, `dialog:default`. For a release build, scope filesystem access via `fs:scope` to the picked folder only.
  - **Why deferred:** Dev permissive defaults are fine; tighten before shipping.
  - **Size:** S.
  - **Touches:** `app/src-tauri/capabilities/default.json`, `app/src-tauri/tauri.conf.json`.

---

## Architectural / under-the-hood (only if needed)

These are off the v1 plan but listed in case use exposes a real need.

- [ ] **Long-lived `claude` subprocess (instead of spawn-per-turn)**
  - **What:** v1 spawns a new `claude -p` for each turn. If first-token latency becomes annoying, switch to a persistent process using `--input-format stream-json` and the Claude Code interactive protocol.
  - **Why deferred:** `APP-FOUNDATION-PLAN.md` explicitly chose spawn-per-turn for simplicity. Only revisit if latency hurts UX.
  - **Size:** M.

- [ ] **Embeddings / vector search over knowledge chunks**
  - **What:** When 517 chunks outgrow keyword routing, embed them and use cosine similarity for retrieval.
  - **Why deferred:** `APP-FOUNDATION-PLAN.md` explicitly defers RAG/embeddings. Keyword routing was deemed sufficient for v1.
  - **Size:** L. Requires embedding model choice, vector store (probably sqlite-vss or similar — would deviate from "no DB" rule).

- [ ] **Meta Ads API integration**
  - **What:** Pull spend/CPM/CTR/CVR/CPA/ROAS directly from Meta Ads instead of paste/CSV.
  - **Why deferred:** Explicitly out of v1 scope per `APP-FOUNDATION-PLAN.md`. May or may not ever be wanted given the "no recurring fees / no auth" stance.
  - **Size:** L. Adds OAuth, token storage, refresh cycle — significant departure from current architecture.

- [ ] **Keychain-backed credential storage** (follow-up to shipped Per-client Meta token storage)
  - **What:** Replace the plain-YAML store at `data/<client>/credentials.yaml` with OS-native secret storage via `tauri-plugin-stronghold` (Tauri-native, encrypted vault) or `tauri-plugin-keyring` (delegates to Windows Credential Manager / macOS Keychain / Secret Service). UI layer stays the same; only the read/write commands change.
  - **Why deferred:** v1 deliberately picked file-based for portability (everything about a client lives in one folder) and zero extra plugins. Upgrade once a user explicitly needs at-rest encryption or starts syncing the folder via iCloud/Dropbox/OneDrive.
  - **Size:** M. Add plugin, migrate existing `credentials.yaml` files on first run, delete the YAML.
  - **Touches:** `app/src-tauri/Cargo.toml`, `credentials.rs`, one-time migration helper, capabilities config.

---

## Known bugs (deferred 2026-05-26)

Surfaced during a code-review bug sweep. Left untouched because each changes client-facing numbers or depends on Graph API behaviour that needs live testing. Jake chose to defer; decide per-item later.

- [ ] **Meta conversion double-counting** (`app/src-tauri/src/meta_ads.rs`, `CONVERSION_ACTIONS` + `extract_actions_value`)
  - **What:** With no per-client `conversion_action` override, `extract_actions_value` SUMS every matching action type. The allowlist contains overlapping types Meta reports for the same conversion (`purchase`, `omni_purchase`, `offsite_conversion.fb_pixel_purchase` are one sale counted three ways; same for the lead variants). Results / CPA / ROAS are inflated ~2-3x for affected clients.
  - **Fix direction:** Iterate the allowlist in priority order and take the first matching type's value instead of summing.
  - **Why deferred:** Cutting reported conversions sharply could flip the optimizer's KILL/SCALE verdicts, whose thresholds may be tuned against the current inflated numbers. Re-check `adsOptimizer.ts` thresholds when applying.
  - **Size:** S to change, M to validate against real account data.

- [ ] **`deep_copy=true` on ad-set/ad duplication** (`app/src-tauri/src/meta_actions.rs`, `duplicate_object`)
  - **What:** `duplicate_object` sends `deep_copy=true` for all `/copies` calls. `deep_copy` may only be valid on campaign copies; ad-set and ad duplication could be failing.
  - **Fix direction:** Branch on object kind, only send `deep_copy` for campaigns.
  - **Why deferred:** Needs live Graph API testing to confirm the rejection.
  - **Size:** S.

- [ ] **Replicate polling returns success on timeout** (`app/src-tauri/src/replicate.rs`)
  - **What:** When a prediction is still running at the iteration/time budget, the loop breaks and returns `Ok` with `status: "processing"` and empty output. Long video/image jobs look "done" with no result.
  - **Fix direction:** After the loop, if status is non-terminal, return an explicit timeout error including the prediction id.
  - **Size:** S.

---

*Backlog last updated 2026-05-26. Update entries when you ship them or change your mind about deferring them.*
