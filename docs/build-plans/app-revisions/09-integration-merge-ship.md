# Integration, Merge & Ship - Plan

Run this AFTER all seven per-page instances (plans 01-05, 07, 08) have finished and
committed to their `rev/*` branches. It merges the branches, verifies the combined
app, ships it, and cleans up. Run every command from the MAIN repo
(`C:\Users\games\Desktop\hauck-marketing-lab`), not a worktree.

Ground rules still apply: no em dashes, never name GoHighLevel/GHL in client UI, and
a real client never sees fabricated data.

## The seven branches
`rev/paid-ads`, `rev/reviews`, `rev/website`, `rev/social`, `rev/inbox`,
`rev/reactivation`, `rev/leads`. Their worktrees are at
`C:\Users\games\Desktop\hml-worktrees\<name>`.

---

## Step A: Confirm each instance finished green
- [ ] In each of the seven sessions, confirm it ended with `npm run typecheck`, `npm test`, and `npm run build` all green and its work committed.
- [ ] If a session left uncommitted changes, have it commit before you touch that branch.

## Step B: Merge one branch at a time, with a build gate
Merge one, verify, then the next. One at a time so a break points at a single branch.

- [ ] Merge the first branch:
```
cd C:\Users\games\Desktop\hauck-marketing-lab
git merge rev/paid-ads
cd command-center\app; npm run typecheck; npm run build; cd ..\..
```
- [ ] If clean, repeat the same two commands for each remaining branch, in this order: `rev/reviews`, `rev/website`, `rev/social`, `rev/inbox`, `rev/reactivation`, `rev/leads`.
- [ ] If a merge reports a CONFLICT (unlikely, the plans own disjoint files): it will almost certainly be a small shared utility (for example the inbox classifier `src/lib/inboxFilters.ts` / `functions/lib/origin.ts`). Keep BOTH sides' changes, save, `git add <file>`, then `git commit`. If the conflict is larger than a small shared helper, stop and reassess before continuing.

## Step C: Verify the fully merged app
- [ ] From `command-center\app`: `npm run typecheck && npm test && npm run build`, all green.
- [ ] `npm run dev`, then walk every changed page at `?demo=1` and eyeball the UI end to end (Paid Ads, Google Reviews, Website, Social Media, Inbox, Reactivation, Leads).

## Step D: Ship
- [ ] Push and let Cloudflare deploy:
```
git push origin main
```
- [ ] Watch the deploy finish, then confirm the live bundle hash changed (the standing "did it actually deploy" check: grep the live JS bundle for a string you know shipped).

## Step E: Smoke-test live in a Willis session (only Jake can do this)
The instances cannot verify real data (their `/api/*` calls are 401). In a real Willis
login on the live app, click through each page. Pay closest attention to the items the
plans flagged as best-effort or wiring-dependent:
- [ ] Social: engagement data (comments/likes/reach) and comment replies.
- [ ] Paid Ads: Ad Stats real numbers, Media library, per-ad placement previews, phase badge.
- [ ] Website: Insights chat-widget + estimate-form numbers (from GoHighLevel).
- [ ] Google Reviews: Overview data, the read-only Review Pipeline page.
- [ ] Inbox: SMS vs Email split, source categories, both-channel disclaimer on real conversations.
- [ ] Reactivation: Pipeline / Full Data / Messages against real data.

## Step F: Clean up
- [ ] Remove the worktrees (repeat for each name):
```
git worktree remove C:\Users\games\Desktop\hml-worktrees\paid-ads
```
(then reviews, website, social, inbox, reactivation, leads)
- [ ] Delete the merged branches:
```
git branch -d rev/paid-ads rev/reviews rev/website rev/social rev/inbox rev/reactivation rev/leads
```

## Step G: Loose ends to decide later (not blocking)
- [ ] Audiences: decide where it lives now that Campaigns became Commercial Outreach (kept alive but unlinked in the scaffold).
- [ ] Deferred to the internal-automations phase: the Leads pipeline rebuild (Organic / Paid Ads / Sales + Trash), the Reviews Google Business Profile page (blocked on GBP API approval), the completed-job review trigger, and any automation / write-back wiring.

## Shortcut
Jake can instead say the word once the seven are done, and this whole plan (Steps B-D)
can be run for him end to end (merge, verify, ship, watch the deploy), handing back a
clean live app to smoke-test at Step E.
