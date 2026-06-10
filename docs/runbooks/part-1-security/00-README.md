# Part 1 Security Fixes: Runbook

Part of the five-part fix plan; see the [master index](../README.md) for the full sequence.

Date: June 2026. Scope: **test account only**. No live client is configured by anything in this folder; client onboarding is a separate, later runbook.

Click paths for every dashboard used below live in the [Software Guide](../SOFTWARE-GUIDE.md) (Recipes A through F).

This folder documents the Part 1 security and tenancy fixes for the client dashboard (`client-dashboard/`), split into the code changes already made (reference) and the operator steps Jake performs by hand (checklist).

## The order

Do the steps in this order. Each file is self-contained.

| Step | File | What it does | Status |
|---|---|---|---|
| 1 | [01-supabase-migrations.md](01-supabase-migrations.md) | Apply migrations 0003, 0004, 0006 to the Supabase database | done 2026-06-10 |
| 2 | [02-cloudflare-env.md](02-cloudflare-env.md) | Generate and set SESSION_SECRET and WEBHOOK_SECRET, redeploy | done 2026-06-10 |
| 3 | [03-ghl-webhooks.md](03-ghl-webhooks.md) | Build and publish the three notify workflows in the TEST GHL sub-account | done 2026-06-10 |
| 4 | [04-verification.md](04-verification.md) | Prove the webhook lock, tenant routing, and end-to-end notifications work | done 2026-06-10 |
| ref | [05-code-changes-reference.md](05-code-changes-reference.md) | Record of every code change made in Part 1 | done |

Mark the boxes as you go. Step 4 cannot pass until 1 through 3 are complete.

Every step file opens with a **"Manual actions checklist"**: the complete list of physical actions for that step, numbered in execution order, with checkboxes. Work straight down that list; the sections below it in each file explain any action in more detail and carry the troubleshooting tables. If every box in all four checklists is ticked, Part 1 is 100% done.

## Why these steps exist (one paragraph)

The June 2026 audit found the webhook endpoint accepted unauthenticated traffic and wrote every event to a hardcoded tenant, the session cookie had a publicly known fallback signing key, login had no rate limiting, and dev backdoors shipped in production builds. The code fixes are merged locally; these operator steps supply the secrets, database schema, and GHL configuration the fixed code requires. Until Step 2 is done, the webhook endpoint rejects everything by design (fail closed).

## Ground rules

- Copy SQL into Supabase using `pbcopy` (exact commands are in step 1), never by copying out of a chat or terminal window. Terminal line-wrapping has already corrupted one paste and produced a confusing syntax error.
- All migrations in this repo are idempotent. Re-running one that already applied is safe and does nothing.
- If any command or screen does not match what a step describes, stop and ask Claude rather than improvising. Paste the exact error text.
