# Mobile App Phase 2: Real Product Build Plan

> Turn the mock-data PWA at `client-dashboard/` into a real product clients log into and use. Tier 1 only today. Target end-of-day state: client #1 (window-cleaning business) logs in on their phone, sees their actual GHL leads, can call/SMS them, marks Won, and the GHL opportunity updates. Push notifications fire on new leads.

## Decisions locked

- **Client #1 niche:** Window cleaning. Core app stays generic, all per-client behavior comes from config (brand, pipeline, app name).
- **GHL setup state:** Nothing yet. We provision a Private Integrations token in their sub-account today.
- **Backend:** Supabase (Postgres + magic-link auth + RLS + realtime).
- **Pipeline strategy:** Mirror GHL exactly per client. Pull pipeline structure on login, render whatever stages they use.
- **Data mode:** Live client #1 data, full read/write. Confirm-modal on destructive ops.
- **Domain:** `dash.hauckmarketing.com`. Apex `hauckmarketing.com` lives at Namecheap. We add a single CNAME from Namecheap → `hauck-dashboard.pages.dev`. No nameserver move today.
- **API runtime:** Cloudflare Pages Functions (not a standalone Worker). Lives under `client-dashboard/functions/api/*` in the same repo. Routes at `dash.hauckmarketing.com/api/*`. Same env vars, KV bindings, webhook handlers as a regular Worker. Avoids needing the apex on Cloudflare.
- **Client #1:** Willis Windows (window cleaning).
- **Jake's iPhone:** iOS 26.5. Web Push works fully as installed PWA.
- **Today's scope:** Tier 1 only. Six features. Tier 2/3 next week.

## Architecture

```
                  dash.hauckmarketing.com  (Namecheap CNAME ─► CF Pages)
                          │
            ┌─────────────┴──────────────┐
            │                            │
       PWA frontend            Pages Functions /api/*
       (React)                 (same deploy, runs at the edge)
            │                            │
            ├─ Supabase JS               ├─ GHL API v2
            │   (auth, tenants,          │   (contacts, opportunities,
            │    push_subscriptions)     │    conversations, pipelines)
            │                            │
            │                            └─ Web Push to subscribers
            │                                 (triggered by GHL webhooks)
            │
            └─ Service worker (Workbox + push handler)
```

Why a server function sits in front of GHL: hides the GHL token from the browser, receives webhooks (browsers can't), centralizes rate-limit + error handling, sends web push.

We do NOT mirror leads into Supabase. Source of truth stays GHL. App fetches on demand, caches in IndexedDB via TanStack Query.

## Supabase schema

```sql
create table tenants (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  niche       text not null,
  brand_color text not null,
  brand_initials text not null,
  app_name    text not null,
  won_label   text default 'Won',
  value_label text default 'Job Value',
  ghl_location_id text not null,
  ghl_token   text not null,  -- encrypted at column level
  created_at  timestamptz default now()
);

create table tenant_users (
  tenant_id uuid references tenants on delete cascade,
  user_id   uuid references auth.users on delete cascade,
  role      text check (role in ('owner','manager','rep')) not null,
  primary key (tenant_id, user_id)
);

create table push_subscriptions (
  id        bigserial primary key,
  user_id   uuid references auth.users on delete cascade,
  endpoint  text not null,
  p256dh    text not null,
  auth      text not null,
  created_at timestamptz default now()
);
```

RLS: a row is readable only if `auth.uid()` is in `tenant_users` for that tenant.

## Today's section list

| # | Section | Output | Hours | Depends on |
|---|---|---|---|---|
| 01 | [Provision external services](01-provision.md) | Supabase project, Cloudflare Worker scaffold, GHL Private Integration token, DNS for dash.hauckmarketing.com | 1.0 | none |
| 02 | [Supabase auth + tenants](02-supabase-auth.md) | Magic-link Login replaces fake auth, tenants schema, client #1 seeded, tenant config loads on session | 2.0 | 01 |
| 03 | [GHL Worker API](03-ghl-worker.md) | Worker routes for leads/pipeline/lead-detail/update-stage/send-sms/webhook, JWT verification, per-tenant token lookup | 3.0 | 01 |
| 04 | [Wire frontend to real data](04-wire-frontend.md) | Replace mock data with TanStack Query against Worker, dynamic pipeline stages, confirm-modal on Won/Lost | 2.5 | 02, 03 |
| 05 | [Click-to-call + SMS thread](05-call-and-sms.md) | `tel:` link, inline conversation pulled from GHL Conversations API, two-way SMS send | 1.0 | 04 |
| 06 | [Push notifications](06-push.md) | VAPID setup, subscribe flow, GHL webhook → Worker → web push, deep-link to lead on tap | 2.0 | 03 |
| 07 | [Deploy + end-to-end test](07-deploy-and-test.md) | Pages live, Worker live, DNS pointed, webhook registered, full flow tested on Jake's phone | 1.5 | 06 |

**Total: ~13 hours of focused work.** Realistic if external-service setup goes cleanly.

## Universal constraints for this build

- No em dashes anywhere (chat, ad copy, UI, docs, code).
- No emojis in UI or code.
- Sans-serif 500–600 weight for display type. No italic serif headlines.
- Touch targets ≥44px. Mobile-first at 375px.
- Terse functional copy. No marketing prose.
- Every destructive write (stage change, Won submission, SMS send) shows a confirm step the first time per session.
- All GHL writes log to a Supabase `activity_log` table so Jake can audit what happened if something looks wrong.

## Risk register

| Risk | Mitigation |
|---|---|
| GHL webhook needs a public Worker URL before we can register it | Section 01 deploys an empty Worker first; webhook registration is in section 06 once the receiver is real |
| Web Push on iOS only works when installed as PWA from iOS 16.4+ | Confirm Jake's iPhone iOS version before section 06; if older, push still works on Android + desktop Chrome |
| Supabase magic-link email goes to spam | Use Supabase's default SMTP today, switch to Resend with hauckmarketing.com sender domain next week |
| GHL rate limits (100 req/10s per location) | Worker caches pipeline + tenant config in KV; lead list fetches paginated |
| Live read/write means a bug could move real opportunities | Confirm modals on writes, activity log table, easy revert from GHL UI if needed |
| Deleting a Section 04 file before its commit lands | One section per commit, in order, with the commit message in each section's Stop condition |

## When sections ship, delete the section file

Same rule as before. Per-section files are scaffolding. After all 7 ship and the live demo works, this whole folder gets deleted again.
