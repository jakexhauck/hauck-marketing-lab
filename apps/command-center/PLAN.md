# Command Center: bug-audit follow-up plan

Status as of 2026-06-19. Context for whoever picks this up next (you or a future
Claude session).

## What shipped

Commit `5772139` on `main` (auto-deploys to Cloudflare Pages). A correctness +
resilience pass across the client Command Center, plus the in-progress
preview-as-staff admin work that was already uncommitted.

DB migration `0012_webhook_idempotency.sql` is **already applied** to production
(`npm run db:migrate`, 2026-06-19).

Fixes in this pass (all typechecked, built, unit-tested, boot-smoke-tested):

- Auth: a 5xx session probe no longer force-logs users out (offline-grace).
- Inbox/dashboard: unread count now paginates every conversation (was first 100).
- Calendar: guards NaN `?from`/`?to`, falls back to the default window.
- Webhook: idempotent insert on the GHL event id, multi-tenant routing by
  `ghl_location_id`, push only on a genuinely new row.
- Tasks: edit default due-date uses the tenant timezone (matches create).
- Service worker: SPA navigation fallback for offline deep links.
- `team/sync`: owner-gated on the signed session, not a spoofable header.
- UI/util: formatMoney 10k boundary, applyBrandVars bad-hex guard,
  AnimatedNumber interrupt, Home permission-gated quick links, Today useNow,
  activity error logging, ViewAsButton inline error, signInWithPassword reset.

---

## Your action items (Jake)

1. **Confirm the deploy went green.** Cloudflare → Workers & Pages → project →
   Deployments. First build is ~2 min.
2. **Post-deploy smoke check on a phone:**
   - Normal login still works.
   - Drop connectivity briefly with the app open: it stays signed in (does not
     bounce to login). This is the main auth fix.
   - Over the next day: a single new lead buzzes the phone **once**, not 2-3x.
3. **Decide on the `/admin/tasks` nav tab.** It is a dead link today (no route).
   Tell me to either hide it, or give me the scope to build the Tasks screen.
4. **Confirm the GHL webhook payload carries a unique event `id`.** The webhook
   de-dup keys on it. If your workflow webhooks do not include one, de-dup is a
   harmless no-op (no dupes prevented). Check a live payload, or configure the
   workflow action to include a unique id. Tell me what you find.
5. **Optional decisions** (see "Deferred by design" below) if you want any of
   those changed.

---

## Open items on my side (need your go-ahead or live data)

Each is deferred for a stated reason, not forgotten. None blocks the deploy.

1. **`/admin/tasks`** — hide the nav item (1-line change) OR build the admin
   Tasks screen. Blocked on your decision (#3 above).
2. **Conversation pagination, same-timestamp edge** — pages by `startAfterDate`;
   if many conversations share one `lastMessageDate` at a page boundary, GHL's
   inclusive/exclusive semantics decide whether any get skipped. A de-dup set
   already prevents duplicates. Needs verification against a live conversation
   search with >100 conversations; if it skips, add an id tiebreaker. Blocked on
   a live GHL response (only matters past 100 conversations).
3. **Numeric system-message previews** — `conversations` list could show a
   system line as a preview if GHL sends a numeric `lastMessageType`. Left
   unfixed because mapping it blind risks blanking real previews. Needs a live
   payload showing a numeric system type before I touch it.
4. **Inbound-message webhook deep links** — flagged as a suspicion: GHL
   `InboundMessage` payloads may nest the contact id and carry no
   `opportunityId`, so `message_in` rows could store `lead_id = null` and a push
   could deep-link to `/` instead of the conversation. Needs a real inbound
   message webhook payload to confirm, then fix the field mapping in
   `functions/api/webhook.ts` (`toActivity`).
5. **Webhook id-less coverage** — if #4-Jake shows the payload has no event id,
   design an alternative idempotency key (or have the workflow add an id).

---

## Deferred by design (will not change unless you say so)

- **Preview-as-staff: admin disabled mid-session.** A preview cookie keeps
  working for its 2h read-only life even if the admin is disabled. Fixing means
  a DB round-trip on every preview request (hot path) for a low-risk,
  time-boxed, read-only window. Accepted as-is.
- **`push_subscriptions` stale `unique (user_id, endpoint)` constraint** (from
  0001). Latent only: `user_id` is always null now, so it never collides. A
  one-line migration could drop it; no current impact.
- **Owner shared-password login is single-tenant.** On the one-URL deploy the
  shared-password form only authenticates the env `TENANT_SLUG` tenant; staff
  email login is the real per-client path. This is a product decision, not a
  bug. Remove/hide the shared-password form, or leave it.
- **`functions/lib/admin.ts`** is now unused (team/sync stopped calling it). Left
  in place; safe to delete in a cleanup pass.
