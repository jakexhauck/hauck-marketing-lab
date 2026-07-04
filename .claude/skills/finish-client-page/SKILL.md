---
name: finish-client-page
description: Use when finishing, completing, or fully wiring a client-facing page in the command-center app, desktop and mobile - triggers like "finish the paid ads page", "complete this page", "let's finish X page", "wire up the X page end to end", "make X page production-real". Runs a fixed 10-step page-completion flow (map every surface, reality-check each element, map the GHL pipeline/stages/automations, list gaps, check Doppler secrets, wire real data, UI touch-ups with Jake's sign-off, manual live verification in Jake's own browser, autopilot ship, update connection docs) with four stop-and-ask gates.
---

# Finish a Client Page

Take one client-facing page from "looks done" to genuinely production-real: every number live, every stage and automation wired to GoHighLevel, UI tightened, verified by Jake in his own browser, shipped, and documented. Same ten steps every page.

## When to Use This Skill

Use this skill when Jake wants to:

- Finish, complete, or fully wire a client-side page in the command-center app (e.g. "finish the paid ads page", "let's complete the reviews page").
- Kill demo/sample/hardcoded data on a page and connect it to real Meta / GHL / Supabase data.
- Confirm a page's GHL pipeline, stages, and automations are correctly reflected and connected in the app.

Do **not** use it for building a brand-new page from scratch (use `command-center-section`), for admin-only surfaces, or for pure backend scripts with no page.

## The Four Gates

Run every other step autonomously and report. Stop and bring Jake in ONLY at these four:

- **Gate 1 - Step 3 (GHL mapping):** ask Jake what the page connects to in GHL. Cannot proceed without it.
- **Gate 2 - Step 5 (Keys):** stop ONLY if a required secret is missing from Doppler.
- **Gate 3 - Step 7 (UI touch-ups):** recommend + let Jake direct, get his OK before applying anything.
- **Gate 4 - Step 8 (Verify):** open the page in Jake's browser; he confirms the data himself.

Ship (step 9) is **autopilot** once Jake verifies at gate 4. Do not ask again before pushing.

## The Flow

### 1. Map it
Find every version of the page: desktop, mobile/phone, and any hidden, dormant, or redirected copies. Client pages routinely have 2-3 surfaces (a primary responsive one, a raw dashboard, a redirected sales worklist). List each: route path, component file, live vs synthetic. Name which one is the real client-facing target.

### 2. Reality check
Go element by element (every KPI tile, chart, list, badge, button). Label each: **real / demo / hardcoded / placeholder**. Produce a short reality table. Hardcoded fields hiding inside a "real" endpoint are the usual trap (e.g. a `customers: 0` baked into an insights response).

### 3. Ask about GHL  ← GATE
Most client pages ride on GoHighLevel. Ask Jake directly:

> "What does this page connect to in GoHighLevel? Which pipeline, which stages, and which automations/workflows fire on it?"

Then confirm three things and report:
- The app resolves that pipeline/stages **by name** (id fallback only).
- Every stage Jake named is actually shown in the app UI.
- The automations he named are wired (webhook/endpoint exists and is registered), not dormant.

Flag any stage or automation that exists in GHL but is missing or misnamed in the app.

### 4. List the gaps
From steps 2 and 3, write the gap list: what's fake, what's missing, what backend each gap needs (Meta Graph, GHL, Supabase), and the fix for each. Reference existing build-plan/connection docs if they already spec a fix.

### 5. Check the keys  ← GATE (only if missing)
Confirm every secret the page needs is in **Doppler** (`hauck-command-center` / `prd`), the source of truth. Read headless:

```bash
doppler secrets --project hauck-command-center --config prd --only-names
```

If a key is missing, STOP and tell Jake exactly which one and where it should come from. Never hand-set Cloudflare env; push via `cf-rebind --from-doppler`. Do not sync `CLOUDFLARE_API_TOKEN` / `SUPABASE_ACCESS_TOKEN` into CF runtime.

### 6. Wire it
Kill the fake/demo/hardcoded values found in step 2. Connect each element to its real source. Resolve GHL pipelines/stages by name. Add caching (KV, ~15 min) if the endpoint is hot (multiple upstream calls per load). Keep the demo path intact for `?demo=1` / unauth. Normalize on READ so a partial payload can't white-screen the page.

### 7. UI touch-ups  ← GATE
Two-way, and nothing changes silently:
- Give Jake recommendations: what you'd tighten and why (states, spacing, parity, copy).
- Let Jake also just tell you directly what to change.
- Always cover loading / empty / error states and desktop-vs-mobile parity.
- Remove any "coming soon" or make it real.
- Confirm the final list with Jake, THEN apply.

### 8. Verify live  ← GATE (manual check, Jake's browser)
Do NOT use Playwright or auto-screenshots. **Automatically open the real page in Jake's Chrome. Do not ask permission to open it - just open it.** Then let him confirm the numbers himself.

```
ToolSearch: select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__tabs_create_mcp
```

Call `tabs_context_mcp` first, then open the live client URL to the finished page in a new tab, automatically. Tell Jake what to look at ("check the revenue tile shows a real dollar figure, not zero"). The gate is only his confirmation of the data - wait for that before shipping. Opening the browser is not gated.

### 9. Ship (autopilot)
Once Jake confirms at gate 4: commit, push to origin main, watch the Cloudflare deploy, and smoke-test the live URL yourself (grep the live JS bundle to confirm the new build is serving). Report the commit hash and live bundle name. "Push it" means full ship.

### 10. Write it down
Update the page's connection doc under `command-center/app/docs/connections/` (and any build-plan) so the wiring, GHL pipeline/stages, and remaining follow-ups are recorded. Delete any build-plan that fully shipped.

## Key Facts

- **App root:** `command-center/app/`. Frontend routes under `src/routes/`, hooks under `src/hooks/`, CF Pages Functions under `functions/api/`.
- **Doppler:** project `hauck-command-center`, config `prd`. Agent reads headless; blocked from writes.
- **Cloudflare Pages project is `hauck-dashboard`** (not hauck-command-center). Live client app: app.hauckmarketing.com.
- **Wiring contract:** real session -> `api()` -> GHL/Meta; demo -> `handleDemoRequest()` / `?demo=1`.
- Resolve GHL pipelines and stages **by name**, id as fallback.

## Gotchas

- **Never name GoHighLevel / "GHL" in client-facing UI.** It is the hidden backend. Client copy says "your pipeline", "your leads", never the vendor.
- **Never use em dashes** anywhere: chat, UI, copy, docs, code comments. Use commas, periods, parentheses, colons.
- **PWA deploy lag:** installed client apps need one hard refresh to pick up the engine, then auto-update. Verify a ship by grepping the live JS bundle name, not by one screenshot.
- **Hardcoded values hide inside real endpoints.** An endpoint can be "wired" and still return a baked `0`. Step 2 must inspect the endpoint's actual return, not just whether it fetches.
- **All `/api/*` return 401 when unauthenticated**, so the live-data path can only be verified inside an authed session. That is why step 8 is manual in Jake's logged-in browser.
- **Address Jake as "Sir."** Calm, precise, dry. Push back on bad calls.
