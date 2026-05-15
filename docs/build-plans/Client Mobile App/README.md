# Mobile App (Client Dashboard): Build Plan

> A client-facing mobile web app (PWA) where ad-lead clients view leads, mark outcomes (Booked / Won / Lost), and see CPA / ROAS. **Not** the HML Tauri app, this is a separate product that sits alongside it.

## Scope of this plan

**Phase 1 (these docs): Free clickable demo.** Frontend-only. Mock data. No backend, no auth, no GHL integration. Goal is a working PWA Jake can install on his phone, click through, and show clients to validate the concept.

**Phase 2 (out of scope here, future): Real backend.** Supabase auth, GHL API integration, real per-client data, multi-user invites. Plan written separately when client #2 is signed and the demo has validated the UX.

**Phase 3 (out of scope here, future): HML integration.** Web app outcomes flow back into Client Hub revenue rollups via GHL. Plan written separately.

## Why phase 1 first

- $0 cash cost. ~$15 if Jake wants a domain.
- Sections are independently shippable, each ends at a clean commit. Safe to interrupt when Claude tokens or Jake's attention runs out.
- Validates the UX with real eyes (Jake's first, then a friendly client) before any backend work.
- Doubles as a sales asset for closing client #2 and #3.

## How this differs from HML's architecture

The HML universal constraints ("no DB, no cloud, no auth, folder-as-database, `claude -p` as engine") apply to the **Tauri app**. They do not apply to this client-facing web app. Phase 2 will use Supabase + GHL API + magic-link auth. Keep the two architectures mentally separate.

## Sections

| # | Section | Output | Token weight | Depends on |
|---|---|---|---|---|
| 01 | [Scaffold](01-scaffold.md) | Empty Vite + React + TS + Tailwind app boots at localhost, mobile-first shell layout | Light | none |
| 02 | [Mock data layer](02-mock-data.md) | TypeScript types + fixtures: 3 clients, ~20 leads each, realistic stages | Light | 01 |
| 03 | [Login screen](03-login-screen.md) | Branded login UI, fake magic-link button, lands on dashboard | Light | 01, 02 |
| 04 | [Lead list view](04-lead-list.md) | Mobile dashboard, scrollable lead list with stage filters | Medium | 02, 03 |
| 05 | [Lead detail + outcome marking](05-lead-detail-outcome.md) | Tap lead → mark Booked / Won (with $) / Lost, local state updates | Medium | 04 |
| 06 | [Stats strip](06-stats-strip.md) | KPI cards: Leads MTD, Booked, Won, CPA, ROAS, animated | Light | 02, 05 |
| 07 | [Role toggle](07-role-toggle.md) | Dev switch: Owner / Manager / Rep views, each scoped differently | Medium | 04, 06 |
| 08 | [Brand swap](08-brand-swap.md) | Client selector swaps brand color, logo, app name, pipeline labels | Light | 02, 04 |
| 09 | [PWA manifest](09-pwa-manifest.md) | manifest.json + icons + standalone display, installable on iOS/Android | Light | 01 |
| 10 | [Deploy](10-deploy.md) | Public Cloudflare Pages URL, accessible from any phone | Light | 09 |

**Minimum demo:** Sections 1–6 give a working clickable demo. 7–10 are polish that make it sellable.

## Token-budget rules

- One section per Claude session minimum. Two or three if tokens allow.
- **Commit after every completed section.** Never mid-section. The commit message is in each section's "Stop condition."
- If tokens run low mid-section, finish the current sub-step, stash uncommitted work, and stop. Resume from the section plan next session.
- If a section turns out larger than its weight estimate, split it. Don't push through.

## Project location

`client-dashboard/` at the repo root. Sibling to `app/`, `vault/`, `docs/`. Same monorepo for now; can split out to its own repo in Phase 2 if it grows.

## Stack (locked for Phase 1)

- **Build**: Vite 7
- **Framework**: React 19 + TypeScript 5.8 (match HML's versions so tooling is shared)
- **Styling**: Tailwind v4 with CSS custom properties for brand tokens
- **Routing**: React Router 6
- **State**: React state + Context for current user/role/brand. No Redux, no Zustand in Phase 1.
- **Package manager**: pnpm (match repo convention)
- **Hosting**: Cloudflare Pages (free tier, fast global edge)

## Visual / UX constraints

These come from the universal Hauck Marketing rules in [CLAUDE.md](../../../CLAUDE.md) and the HML feedback memories. They apply here too.

- **No em dashes** anywhere in UI copy, alt text, or comments. Commas / periods / parens / colons.
- **No italic serif on primary headlines.** Sans-serif at 500–600 weight for display type.
- **No emojis** in UI or code.
- **Mobile-first.** Design at 375px reference, scale up. Touch targets ≥44px.
- **Terse, functional copy.** No marketing prose. Labels are labels.
- **Speed.** No loading spinners visible on a normal phone. Mock data is instant; in Phase 2 the cache must keep it that way.

## When sections ship, delete the section file

Per the repo convention. Memory + git history are the lasting record. Section files are scaffolding for the build, not documentation of the finished product. When all 10 are shipped, this folder gets deleted.
