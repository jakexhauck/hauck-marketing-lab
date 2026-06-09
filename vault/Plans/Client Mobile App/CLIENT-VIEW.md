---
type: plan
title: "Mobile App — Client View"
status: draft
tags: [plan, feature]
plan_kind: feature
created: "2026-05-19T13:54:53.000Z"
source: "docs/build-plans/Client Mobile App/CLIENT-VIEW.md"
---

# Mobile App — Client View

What a client (e.g. Willis Windows owner) sees when they log into `dash.hauckmarketing.com`.

## Who can access

Anyone whose `user_id` has a row in `tenant_users`, linking them to a tenant in the `tenants` table. The client must NOT be in `admins` — admins always redirect to `/admin`.

The link is established by the desktop app's onboarding form (Phase 4, "Provision mobile app") which creates the auth user, upserts the tenant, and inserts the `tenant_users` row in one shot.

## Routes (3 tabs + lead detail)

The client lands on `/dashboard` (Opportunities) after sign-in. Three top-level tabs share the same shell:

### `/conversations`
List of every active SMS/email thread for the tenant. Each row:
- Avatar (initials from contact name)
- Contact name + last-message preview (system "opportunity created/changed" entries hidden)
- Time ago
- Unread count badge

Tap a row → `/conversations/:contactId` shows the full thread with a composer at the bottom. Sending an SMS posts to `/api/conversations/:contactId/sms` which calls GHL `/conversations/messages` with `type: SMS`.

### `/contacts` (labeled "Contact Status")
Flat list of every contact in the tenant's GHL location (not just leads in a pipeline). Each row has tap-to-call and tap-to-email buttons. Search filters by name, phone digits, or email.

### `/dashboard` (labeled "Opportunities")
The original pipeline view. Pipeline stage filter at the top (defaults to **New**, no "All" tab). Stats strip, per-stage lead list, swipe-to-advance and swipe-to-call gestures. Tap a row → `/lead/:id` opens the lead detail with the conversation thread + outcome buttons (Won/Lost/No-Show).

## Auth flow

1. Client opens `dash.hauckmarketing.com` → `/login`.
2. Enters their email → magic link.
3. Clicks link in email → `/auth/callback` parses the hash (implicit flow, tokens in URL fragment).
4. `AuthContext` queries the `admins` table → finds nothing → `isAdmin = false`.
5. `RootRedirect` sends them to `/dashboard`.

## Data flow (per tab)

```
Client → tab
   ↓
useLeadsQuery / useContactsQuery / useConversationsQuery
   ↓
GET /api/leads | /api/contacts | /api/conversations
   ↓
_middleware.ts → getTenantForUser(userId) (returns 403 if no tenant)
   ↓ (with tenant)
handler queries GHL using tenant.ghl_token + tenant.ghl_location_id
   ↓
Returns shaped data, sorted by lastActivityAt desc
```

## Branding

Each tenant's `brand_color`, `brand_initials`, `app_name`, `won_label`, `value_label` come from the `tenants` row. `ClientContext` applies them as CSS variables, so the same React code looks like "Willis Leads" with deep blue for one client and "Patriot Plumbing Leads" with red for another.

## Multi-client switching

The desktop dev panel (`?dev=1` query param) lets you swap brand/role for showroom screenshots, but a real client logged in via Supabase only ever sees their own tenant — `getTenantForUser` returns the first tenant their user_id is linked to.

## Key files (frontend)

- `client-dashboard/src/routes/Conversations.tsx` — conversation list.
- `client-dashboard/src/routes/ConversationDetail.tsx` — single thread + composer.
- `client-dashboard/src/routes/Contacts.tsx` — flat contact list.
- `client-dashboard/src/routes/Dashboard.tsx` — opportunities pipeline.
- `client-dashboard/src/routes/LeadDetail.tsx` — single lead, stage actions, SMS thread.
- `client-dashboard/src/components/ViewTabs.tsx` — top tab bar.
- `client-dashboard/src/components/ConversationThread.tsx` / `ConversationThreadByContact.tsx` — message rendering.
- `client-dashboard/src/components/MessageComposer.tsx` / `MessageComposerByContact.tsx` — send SMS.
- `client-dashboard/src/context/AuthContext.tsx` — Supabase magic-link auth + admin detection.

## Key files (backend, Cloudflare Pages Functions)

- `functions/api/leads/index.ts` — list opportunities.
- `functions/api/leads/[id].ts` — single opportunity, PATCH for stage/value/notes.
- `functions/api/leads/[id]/messages.ts` — thread for a lead.
- `functions/api/leads/[id]/sms.ts` — send SMS from lead detail.
- `functions/api/contacts.ts` — list all contacts (paginates up to 1000).
- `functions/api/conversations/index.ts` — list conversations.
- `functions/api/conversations/[contactId]/messages.ts` — thread by contact.
- `functions/api/conversations/[contactId]/sms.ts` — send SMS from a conversation thread.
- `functions/api/pipeline.ts` — pipeline + stages for the tenant.
- `functions/lib/ghl.ts` — GHL API helper (Authorization header, version, retry on 5xx).
- `functions/lib/tenant.ts` — `getTenantForUser` with 60s cache.

## What gets filtered out

Conversations and threads suppress GHL system activity messages whose `type` includes `ACTIVITY` or `OPPORTUNITY` (the "opportunity created", "opportunity stage changed", etc. timeline entries). Real channels — SMS, EMAIL, CALL, VOICEMAIL, LIVE_CHAT, GMB, FB, IG — pass through.

## PWA install

Client opens the URL in Safari → Share → Add to Home Screen. Workbox pre-caches the JS/CSS bundle (~600 KB) so subsequent loads are offline-tolerant. Sign-in still needs network.

## Push notifications

Wired in `functions/api/webhook.ts` + `push_subscriptions` table. A GHL webhook (new contact / opportunity moves to a "alert" stage) fires the function, which fans out web-push notifications to every subscribed device for that tenant.
