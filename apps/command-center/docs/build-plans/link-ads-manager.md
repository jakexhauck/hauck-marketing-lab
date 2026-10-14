# Link the ads manager in one click

## The problem

Linking a new client's Meta ads today means leaving the console, digging the ad
account number out of Business Manager, coming back, and pasting `act_...` into
a text box (admin > client > Paid Ads (Meta), and the same field again in
Onboarding > Wiring). Nothing confirms it was the right account. The Paid Ads
section then stays empty until the nightly ads-cron happens to run.

## The fix

The agency's one System-User token already sees every ad account it has been
granted. `GET /me/adaccounts` returns them with name, currency, timezone and
last-30-day spend in a single Graph call (verified live: it returns Willis
Windows, $743.27 over the last 30 days). So the console can simply show the
list and let Jake pick.

Link becomes: open the client, see the accounts, click the client's one,
done. The account id is never typed.

Three things happen on that click:

1. The account id is saved to the tenant row (existing PATCH).
2. The ad snapshot syncs immediately (existing `POST /api/admin/ads/sync`), so
   the Ad Tracker has data now, not tomorrow morning.
3. The card reads back live spend/leads from Meta, so "is it populated" is
   answered on screen rather than by opening the client app to check.

Two guards, both from the golden rule that a client only ever sees their own
numbers:

- An account already linked to another client is labelled with that client's
  name and needs a confirm before it will move. Silently double-linking is the
  exact failure mode that shows one client another's spend.
- If the account is not in the list, the fallback is a manual paste box plus one
  line saying what to do about it (grant the agency system user access to that
  ad account in Business Manager), because a missing account is an access
  problem, not a typing problem.

## Definition of done

- Admin > client > Paid Ads (Meta) lists real ad accounts and links one on click.
- Onboarding > Wiring offers the same picker for a brand new client.
- Linking triggers a sync and shows the resulting live numbers.
- Already-linked accounts are labelled and confirm before moving.
- Manual paste still works when the picker cannot see the account.
- Unit tests cover the shaping (status, spend, linked-elsewhere, ordering).

## Files

| File | Change |
| --- | --- |
| `functions/lib/metaAdAccounts.ts` | new. Graph field list, fetch, and pure `shapeAdAccounts(rows, tenants, tenantId)` |
| `functions/lib/metaAdAccounts.test.ts` | new. Shaping tests, written first |
| `functions/api/admin/meta/ad-accounts.ts` | new. `GET` -> `{ configured, accounts, error? }`, owner-only via the existing admin gate |
| `src/hooks/useApi.ts` | new `useAdminMetaAdAccountsQuery` |
| `src/components/admin/AdAccountPicker.tsx` | new. The picker + verify + manual fallback, shared by both hosts |
| `src/components/admin/ClientConfigPanel.tsx` | `AdsCard` renders the picker |
| `src/components/admin/onboarding/WiringCard.tsx` | Meta field renders the picker |

No migration: `tenants.meta_ad_account_id` already exists and is already what
every Paid Ads read resolves through.

## Notes

- `/me/businesses` and the nested `business` field both return "Missing
  Permission" on this token (no `business_management` scope), so the list is
  strictly "accounts this system user has been assigned", which is the correct
  set anyway.
- Owners bypass the `adminRoles` allowlist, so the new route needs no rule
  there; a cold caller or setter simply cannot reach it.
