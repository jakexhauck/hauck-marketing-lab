# Step 4: Verification

Goal: prove three things. The webhook endpoint rejects strangers, routes by location, and the whole pipe (GHL event > webhook > database > bell) works.

Time: about 5 minutes. Requires Steps 1 through 3 complete and the Step 2 deploy green.

## Manual actions checklist (do these, in this order)

- [ ] 1. In Claude Code, say **"run the webhook checks"** (Claude runs the four curl tests in 4.1 and reports), or run them yourself from section 4.1 and confirm the outputs are `401`, `401`, `ignored`, `ok` in that order
- [ ] 2. In the Supabase SQL Editor, run the query from 4.2 and confirm a fresh `message_in` row exists
- [ ] 3. Open the app signed in via test mode, wait up to 30 seconds, confirm the bell badge appears
- [ ] 4. Tap the bell, confirm the "Inbound message" item is listed; tap the item, confirm the badge count drops
- [ ] 5. In the TEST GHL sub-account, create a test opportunity (Opportunities > Add); within ~30 seconds confirm a "New lead" notification appears in the app
- [ ] 6. Log out of the app and log back in with the test password, confirming login is healthy
- [ ] 7. Optional: enter a wrong password 10 times, confirm attempt 11 says "too many attempts", then clean up in Supabase with `delete from public.login_attempts;` and log in normally
- [ ] 8. Tick the Step 4 box in [00-README.md](00-README.md) and tell Claude to begin **Part 2**

Commands, expected outputs, and troubleshooting for every action are below.

## 4.1 The lock (run from Claude Code or any terminal)

Ask Claude to "run the webhook checks", or run these yourself. Substitute your real values where marked.

**No token must be rejected:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://dash.hauckmarketing.com/api/webhook \
  -H "content-type: application/json" -d '{}'
```

Expected output: `401`

**Wrong token must be rejected:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "https://dash.hauckmarketing.com/api/webhook?token=wrong" \
  -H "content-type: application/json" -d '{}'
```

Expected output: `401`

**Right token, unknown location must be ignored (auth passes, routing drops it):**

```bash
curl -s -X POST \
  "https://dash.hauckmarketing.com/api/webhook?token=YOUR_WEBHOOK_SECRET" \
  -H "content-type: application/json" \
  -d '{"type":"InboundMessage","locationId":"not-a-real-location","contactId":"x"}'
```

Expected output: `ignored`

**Right token, test location must process:**

```bash
curl -s -X POST \
  "https://dash.hauckmarketing.com/api/webhook?token=YOUR_WEBHOOK_SECRET" \
  -H "content-type: application/json" \
  -d '{"type":"InboundMessage","locationId":"YOUR_TEST_GHL_LOCATION_ID","contactId":"verify-test"}'
```

Expected output: `ok`

(`YOUR_TEST_GHL_LOCATION_ID` is the same value as the Cloudflare `TEST_GHL_LOCATION_ID` variable; as of this writing the test location id is `r0WfsA12qpBv7M185V3v`.)

## 4.2 The database received it

Supabase SQL Editor:

```sql
select action, payload->>'summary' as summary, created_at
from public.activity_log
order by created_at desc
limit 5;
```

Expected: a `message_in` / "Inbound message" row from the curl in 4.1, timestamped just now.

## 4.3 The app shows it

1. Open the app, signed in via **test mode**.
2. On Home, the bell icon should show an unread badge within 30 seconds (it polls).
3. Tap the bell: the "Inbound message" item appears in the Notifications screen.
4. Tap it: it marks read and the badge count drops.

## 4.4 End to end through GHL itself

1. In the TEST GHL sub-account, create a fake opportunity in any pipeline (Opportunities > Add), or send an inbound message from a test contact.
2. Within ~30 seconds the bell badge should bump and the matching item appears.
3. If you enabled push notifications on a phone, it should also receive an OS notification (note: pushes fire for new leads and inbound messages, not stage changes).

## 4.5 Login still healthy

1. Log out, log back in with the test password: works.
2. Optional rate-limit check: type a wrong password 10 times, the 11th attempt should return "too many attempts". Clean up afterward in Supabase: `delete from public.login_attempts;` then log in normally.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| 4.1 returns `503` | WEBHOOK_SECRET not set, or deploy predates it | Redo step 2.2 / 2.4 |
| 4.1 returns `401` with the right token | Token in URL differs from the Cloudflare value (typo, truncation) | Re-paste both sides |
| 4.1 returns `ok` but 4.2 shows nothing | Supabase vars missing on the deploy, or migrations not applied | Check `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` exist in Cloudflare; re-run step 1 diagnostic |
| 4.4 silent but 4.1 works | Workflow unpublished, wrong sub-account, missing `locationId` custom data, or wrong `type` spelling | Re-check step 3 row by row |
| Bell never updates while app open | It polls every 30s; also check you are in test mode, not live | Wait, pull a fresh load, confirm mode |

All green: Part 1 is fully live. Tell Claude to begin **Part 2: GHL write-path fixes**.
