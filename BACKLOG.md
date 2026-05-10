# Backlog — Hauck Marketing Lab App

> **Purpose:** Living menu of features deferred from v1. Pick one, hand it to Claude, ship it. Nothing here is committed work — these are options, not promises.
>
> **Order:** Items are loosely grouped by category, not priority. Priority is yours.
>
> **Format:** Each item has a one-line summary, why-it-was-deferred, rough size, and where in the codebase it'll touch. Check the box when shipped.

---

## v1.1 — Finish what v1 stubbed

Small follow-ups that close gaps the v1 base shell deliberately left open.

- [ ] **Keyword-routed knowledge chunks in prompt assembly**
  - **What:** Read `media-buying/skills/_skill-router.yaml`, build a keyword → chunk-path map, match user input against keywords, inject matched chunks into the prompt below the agent persona.
  - **Why deferred:** v1.0 ships agent body + history + user input only; chunks add a parsing pass that wasn't on the critical path.
  - **Size:** S — one Rust helper to parse the router YAML, one frontend function call wired into `app/src/lib/prompt.ts`.
  - **Touches:** `app/src-tauri/src/folder.rs` (new command), `app/src/lib/prompt.ts`, `app/src/components/ChatDrawer.tsx`.

- [ ] **Populate the Cmd/Ctrl+K command palette**
  - **What:** Currently a placeholder overlay. Wire it to search across: skills (from `_registry.yaml`), recent chats, knowledge chunk titles. Arrow keys to navigate, Enter to act.
  - **Why deferred:** v1 only required the keybind + empty shell; populating it is content/UX, not plumbing.
  - **Size:** M — search index in Rust, fuzzy matcher in TS, result renderer.
  - **Touches:** `app/src/components/CommandPalette.tsx`, `app/src-tauri/src/folder.rs`, `app/src/lib/tauri.ts`.

- [ ] **Skill chips actually scaffold prompts**
  - **What:** v1 chips fill the input with hardcoded prompt strings. Make them read from `media-buying/skills/<category>/<skill>/SKILL.md` and assemble a structured prompt from the SKILL's `inputs` field.
  - **Why deferred:** Needed a working chat loop first; chip-to-prompt scaffolding is structurally similar to Phase 3.5 prompt assembly.
  - **Size:** M.
  - **Touches:** `app/src/components/ChatDrawer.tsx`, new `app/src/lib/skills.ts`, `app/src-tauri/src/folder.rs`.

---

## Dashboard surfaces — wire real data to the v1 placeholders

The v1 dashboard renders the Mission Control layout with **placeholder content** in the KPI strip, hero, diagnosis panel, tracking pulse, and creative ring. These items make each card live.

- [ ] **KPI strip: paste-input flow**
  - **What:** Click a KPI card → drawer/modal opens asking for the value + window. Saves to `media-buying/data/kpis/<client>-<date>.yaml`. Spark renders from the last N entries.
  - **Why deferred:** No Meta Ads API in v1 — data enters via paste. Needs an input surface this v1 didn't build.
  - **Size:** M.
  - **Touches:** New `app/src/components/KpiInput.tsx`, new Rust command `kpi::write_entry`, KPI cards become interactive in `app/src/components/Kpis.tsx`.

- [ ] **Diagnosis form (paste / structured input flow)**
  - **What:** A dedicated surface for pasting a campaign snapshot or filling in fields (spend, CPM, CTR, CVR, CPA, ROAS, frequency, creatives active). Sends to Zenith via `claude -p` with a structured diagnose prompt. Result writes to `outputs/diagnoses/`.
  - **Why deferred:** Listed explicitly in `APP-FOUNDATION-PLAN.md` § v1 deliberately omits.
  - **Size:** L.
  - **Touches:** New route/surface, new Rust commands for `outputs/diagnoses/`, integrates with chat drawer or replaces hero block when active.

- [ ] **Hero block reads from latest diagnosis**
  - **What:** v1 hero is hardcoded. Once diagnoses are persisted, hero pulls the most recent and renders its verdict/headline/body. Spectrum marker drives from the diagnosis's "scale-readiness" score.
  - **Why deferred:** Depends on the diagnosis form shipping.
  - **Size:** S after diagnosis form lands.
  - **Touches:** `app/src/components/Hero.tsx`, `app/src-tauri/src/folder.rs` (read latest diagnosis).

- [ ] **Diagnosis panel renders the latest agent findings**
  - **What:** v1 shows hardcoded findings. Wire to the most recent file in `outputs/diagnoses/` and render its findings array.
  - **Why deferred:** Same dependency as hero — needs the diagnosis form to produce real files first.
  - **Size:** S.
  - **Touches:** `app/src/components/DiagnosisPanel.tsx`.

- [ ] **Tracking pulse reads real values**
  - **What:** Pull pixel/CAPI/EMQ values from a `data/tracking.yaml` or similar. Probably needs a tracking audit form to populate.
  - **Why deferred:** No tracking API; needs an input surface.
  - **Size:** M (form + render).
  - **Touches:** New `app/src/components/TrackingAudit.tsx`, render path in `TrackingPulse.tsx`.

- [ ] **Creative diversity ring reads from a creatives manifest**
  - **What:** Read `data/creatives/<client>.yaml` with active variants + signals (go/hold/stop). Ring fills based on count, list renders entries.
  - **Why deferred:** Needs a creatives-tracking surface.
  - **Size:** M.
  - **Touches:** `app/src/components/CreativeRing.tsx`, new manifest schema.

---

## Generators (the productive flows)

Surfaces where the user produces new artifacts via an agent.

- [ ] **Hook generator UI**
  - **What:** Dedicated form: client + angle count + creatives per angle + seed (optional). Dispatches Vortex with a structured prompt. Renders generated hooks in a reviewable list. Save to `outputs/hooks/YYYY-MM-DD-<slug>.md`.
  - **Why deferred:** In `APP-FOUNDATION-PLAN.md` § v1 deliberately omits.
  - **Size:** L.
  - **Touches:** New route/surface, new Rust command for `outputs/hooks/`, streaming reused from chat drawer.

- [ ] **Creative brief builder**
  - **What:** Form-driven brief generation using `media-buying/skills/templates/creative-brief.md`. Output saves to `outputs/briefs/`.
  - **Why deferred:** Same family as hook generator — needs the generator-surface pattern established.
  - **Size:** M after hook generator pattern exists.
  - **Touches:** New surface, reuses generator scaffolding.

- [ ] **Report builder**
  - **What:** Performance-report generation using `media-buying/skills/templates/performance-report.md`. Output saves to `outputs/reports/`. Export to PDF (optional).
  - **Why deferred:** In `APP-FOUNDATION-PLAN.md` § v1 deliberately omits.
  - **Size:** L (M without PDF).
  - **Touches:** New surface, possibly add a PDF crate to Rust.

- [ ] **Scale-readiness UI**
  - **What:** Single-button "Am I ready to scale?" surface that runs `scale-readiness-check` skill against current data. Renders a go/hold/kill verdict with reasoning.
  - **Why deferred:** In `APP-FOUNDATION-PLAN.md` § v1 deliberately omits.
  - **Size:** M.
  - **Touches:** New surface, ties to the spectrum bar on the hero.

- [ ] **Tracking audit UI**
  - **What:** Walk-through form: pixel ID, CAPI status, EMQ score, dedup setup. Renders a per-check status with copy-paste fix snippets. Output saves to `outputs/audits/`.
  - **Why deferred:** In `APP-FOUNDATION-PLAN.md` § v1 deliberately omits.
  - **Size:** M.
  - **Touches:** New surface.

- [ ] **Workflow chains (launch / optimize / scale)**
  - **What:** Multi-step guided flows from `media-buying/README.md` — e.g. "launch campaign" walks Aurelius → Stratos → Vortex → Nexus → back to Aurelius for a final go/no-go.
  - **Why deferred:** Composite of several generators above.
  - **Size:** L.
  - **Touches:** New orchestration layer, sequential agent invocations, shared state across steps.

---

## Multi-client and config

Generalize the hardcoded "Willis Windows" into a multi-client model.

- [ ] **Multi-client management**
  - **What:** Switch active client via the status bar pill or a clients page. Each client gets its own `data/<client>/` subfolder for KPIs, creatives, diagnoses. Dashboard re-reads on switch.
  - **Why deferred:** v1 hardcoded `Willis Windows` for shipping speed. The architecture supports multi-client; just needs UI + folder convention.
  - **Size:** L.
  - **Touches:** New `data/clients.yaml` registry, status bar becomes interactive, all dashboard components take a client prop, new Rust command for client list.

- [ ] **Settings / preferences screen**
  - **What:** Change picked folder, default agent, client list, theme overrides (minor — Mission Control is the look), shortcut customization.
  - **Why deferred:** In `APP-FOUNDATION-PLAN.md` § v1 deliberately omits.
  - **Size:** M.
  - **Touches:** New surface, ties to `config.rs`.

- [ ] **Per-client benchmark sets**
  - **What:** `benchmarks-brasil.yaml` is the only one present and is high-ticket challenge-funnel oriented. Add `benchmarks-us-local-lead-gen.yaml` for Willis Windows. Make benchmark selection part of the client config.
  - **Why deferred:** Content work, not app work. Flagged in `APP-FOUNDATION-PLAN.md` § Known Mismatches.
  - **Size:** S (content) + S (app wiring) = S/M.
  - **Touches:** New benchmarks YAML, `data/clients.yaml` references it, KPI strip reads bench from active client.

---

## Browsing / discovery

- [ ] **Knowledge browser**
  - **What:** Searchable, categorized view of `media-buying/knowledge/TFC-*.md` (517 chunks). Open a chunk → read pane. Pin chunks to the current chat context.
  - **Why deferred:** In `APP-FOUNDATION-PLAN.md` § v1 deliberately omits.
  - **Size:** L.
  - **Touches:** New surface, new Rust commands for knowledge listing + content fetch, search index.

- [ ] **Output materialization back to dashboard cards**
  - **What:** When an agent writes to `outputs/`, the relevant dashboard panel updates without manual refresh. E.g., a new diagnosis → diagnosis panel reflects it immediately, hero updates verdict.
  - **Why deferred:** v1 has refresh-on-focus only.
  - **Size:** M.
  - **Touches:** Event bus from Rust on chat-saved, dashboard subscribes.

- [ ] **Chat search / filter on Recent Threads**
  - **What:** Search bar above Recent Threads, filter by agent, date range, or keyword.
  - **Why deferred:** Recent threads list works for v1 (5 most recent). Search needed when chat count grows.
  - **Size:** S.
  - **Touches:** `app/src/components/RecentThreads.tsx`, search done in-frontend (no server).

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

---

*Backlog last updated 2026-05-10. Update entries when you ship them or change your mind about deferring them.*
