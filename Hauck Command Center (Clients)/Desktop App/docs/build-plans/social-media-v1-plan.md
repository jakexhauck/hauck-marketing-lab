# Social Media v1 - Build Plan

> Companion to `docs/social-media-services-map.md`. That doc is the full menu. This is what we build now.
> Status: PLAN ONLY. Nothing built. Awaiting Jake's go.

## Decisions baked in (veto any of these)

1. **Model:** **Self-serve.** The client creates, schedules, and publishes their own posts. We are not in the daily loop. The AI does the heavy lifting because the client is a business owner, not a copywriter.
2. **Where:** **Mobile app, client-facing, mobile-first.** Owners live on their phone. Desktop CRM gets a light agency oversight view (see what clients are posting, optional safety-net review), but the primary surface is mobile.
3. **Publishing:** We **wrap GHL's Social Planner** via its API. We do NOT rebuild platform connections, OAuth, or the actual publishing. GHL handles the plumbing; we build the value layer on top. (Massive effort saver.)
4. **Scope discipline:** v1 is the wedge only. Tier 3 moat features (revenue attribution, ads bridge) are v2, called out below so we don't paint ourselves into a corner.

## What "self-serve" changes vs done-for-you

- The bar for simplicity is much higher. The client is not skilled. If it takes more than a few taps, they won't use it and they'll churn.
- The AI is not a convenience, it is the product. The client should barely type. They pick a topic (or accept a suggested one) and the AI produces an on-voice, ready-to-post draft.
- There is no "agency approves client" step. The client is the approver of their own AI drafts.
- Optional: an agency safety-net review toggle per client (we glance before it publishes). Off by default; on for clients who want hand-holding.
- Onboarding matters more. The client has to connect accounts and "teach" the AI their voice without us sitting next to them.

## Definition of done (v1)

A client, on their phone, with no help from us, can:
- Connect their social accounts (via GHL).
- Get AI-suggested post ideas and generate an on-voice draft in a few taps.
- Edit lightly, then schedule or publish through GHL.
- Generate a batch (e.g. a week or month) when they want to get ahead.
- See basic, plain-English performance after posts go live.

If a real client does all of that without calling us, v1 is done.

---

## Phase 0 - Foundation (GHL wiring)
**Goal:** Read and write the GHL Social Planner from our app.
- Confirm what the GHL social API actually exposes (accounts, create/schedule post, list scheduled, fetch analytics). This is the single biggest unknown; verify before anything else.
- Account connection surface: show which of the client's platforms are linked, link new ones.
- **Done when:** we can programmatically schedule a test post to a real connected account and see it appear on the platform.

## Phase 1 - Mobile composer + AI voice (the wedge)
**Goal:** The client creates a post that sounds like them, in a few taps, on their phone.
- Mobile post composer: pick a topic (or accept a suggestion), AI writes the caption, client tweaks, adds image(s), picks platforms + time.
- AI caption generation wired to the `copywriter` skill, fed the client's vault Profile + Memory so the voice is theirs, not generic.
- Per-platform adaptation: one idea, auto-tuned per platform (FB / IG / LinkedIn / TikTok tone + length).
- Ruthlessly simple. The default path is: tap topic -> get draft -> tap publish.
- **Done when:** a client picks a topic, gets an on-voice draft, lightly edits, and publishes, all on their phone, no help.

## Phase 2 - The content engine (idea feed + batch)
**Goal:** Kill the blank-box problem so a non-marketer always knows what to post.
- Idea feed: AI suggests post ideas from the client's services, offers, and seasonality. Client taps one -> straight into the composer with a draft ready.
- "Get ahead" batch action: generate a week or month of drafts at once for clients who want to plan.
- Per-industry content frameworks as the prompt backbone (promo, tip, social proof, behind-the-scenes, FAQ, etc.).
- Drafts land in the client's own queue to review, edit, schedule.
- **Done when:** a client who has no idea what to post taps a suggestion and ships it, and can batch a month when they want to.

## Phase 3 - Queue, scheduling + optional agency safety-net
**Goal:** Client manages their own pipeline; we can glance if they want.
- Client's content queue + calendar on mobile: drafts, scheduled, published, with realistic per-platform previews.
- Schedule/reschedule, edit, delete, publish now.
- **Optional agency review toggle** (per client, off by default): when on, the client's posts wait for a quick agency thumbs-up in the Desktop CRM before publishing. For clients who want hand-holding.
- Reuses existing mobile patterns (bottom-nav, conversation-style UI).
- **Done when:** a client runs their own queue end to end; and when the safety-net is on, an operator approves from the Desktop CRM.

## Phase 4 - Publish + basic reporting
**Goal:** Approved posts go live; owner sees what worked.
- Approved + scheduled posts publish via GHL on schedule.
- Calendar view of scheduled/published in the Desktop CRM.
- Plain-English reporting (lean on the `data-analyst` skill): top posts, best posting time learned per account, simple week-over-week. No vanity-metric walls.
- **Done when:** a published post shows real numbers in language an owner gets.

---

## v2 (the moat - NOT now, but design Phase 0 so it's possible later)
- **Revenue attribution:** post -> lead -> booked job -> $. Requires linking social-sourced contacts through the CRM pipeline. The killer feature; biggest plumbing.
- **Organic -> paid bridge:** one-tap boost winning organic posts as Meta ads.
- **CRM-triggered drafts:** new 5-star review (ties to the planned Google Reviews build) or completed job auto-drafts a post.
- **Social DMs/comments into the unified inbox** as leads.

## Risks / unknowns to resolve first
1. **GHL social API coverage.** If it can't schedule or fetch analytics programmatically, Phases 0 and 4 change shape. Verify in Phase 0 before committing.
2. **Mobile preview fidelity.** Realistic per-platform previews are fiddly; keep v1 previews "good enough," not pixel-perfect.
3. **AI cost/quality at batch scale.** Generating 20 on-voice posts per client per month across N clients; check token cost early.

## Suggested sequence
Phase 0 -> 1 -> 2 -> 3 -> 4, in order. Each phase is independently demoable. Stop and reassess after Phase 1 (proves the voice edge) before investing in the batch engine.
