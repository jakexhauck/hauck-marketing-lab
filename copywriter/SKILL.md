---
name: copywriter
description: Write high-converting ads, emails, DMs, and scripts in any client's exact voice. Builds a voice profile from existing content, applies the direct-response canon (awareness levels, market sophistication, mechanism), and produces copy that sounds like a real person, not AI. Includes an ad-platform compliance audit. Use for all client copy needs.
---

# Copywriter Skill

## Slash Command Usage

```
/voice-profile client="Miami Smiles Dental" content="[paste examples]"
/write-ads client="Miami Smiles Dental" service="teeth whitening" goal="book consultation" count=5
/write-emails client="Miami Smiles Dental" type="no-show-followup" sequence=5
/write-dms leads="leads-miami-dentist-2026-04-17.csv"
/write-landing client="Miami Smiles Dental" service="Invisalign"
/score-copy content="[paste copy here]"
/check-compliance content="[paste copy here]" platform="meta"
```

## Voice Profile Workflow

```
/voice-profile client="[NAME]" content="[paste 5-10 examples of their existing content]"
```

Analyze and output a Voice Profile document with:
1. **Tone**: formal/casual/friendly/authoritative/conversational
2. **Vocabulary level**: simple/intermediate/sophisticated
3. **Common phrases**: words and expressions they use repeatedly
4. **Emphasis patterns**: what they lead with (price, quality, speed, trust, results)
5. **What they never say**: phrases that would sound off-brand
6. **Customer language**: how they refer to their customers and their problems
7. **Personality markers**: humor, warmth, directness, energy level

Save as `[clientname]-voice-profile.md`

## Ad Script Workflow

```
/write-ads client="[NAME]" service="[SERVICE]" goal="[book call/visit/DM]" format="[talking-head/ugc/testimonial]" count=5
```

Before writing: pick the prospect's awareness level (usually Unaware or Problem-aware for cold local traffic) and read the market sophistication. Lead with the problem or a unique mechanism, not the product. See Frameworks Reference below.

Write 5 ad scripts each with a different hook angle:
1. Problem-focused hook
2. Result/transformation hook
3. Curiosity/question hook
4. Bold claim hook
5. Story hook

Each script includes:
- **Hook** (first 3 seconds): the exact opening line
- **Body** (what they say): full spoken script, 45-90 seconds
- **CTA**: exact closing line and call to action
- **Hook Score** (1-10): how likely this is to stop the scroll
- **Format note**: any visual direction needed

Rules for every script:
- No "hey guys" or "welcome to" openers
- No em dashes used as dramatic pauses
- Use specific numbers wherever possible
- Sound like a real person, not a copywriter
- CTA must tell them exactly what to do next

## Email Sequence Workflow

```
/write-emails client="[NAME]" type="[sequence-type]" sequence=[number]
```

**Sequence types:**
- `welcome` — new lead just opted in (3-5 emails)
- `no-show-followup` — booked but didn't show (5 emails)
- `post-consultation` — had call but didn't close (5 emails)
- `reengagement` — cold lead, hasn't opened in 30 days (3 emails)
- `onboarding` — just became a client (5 emails)

Each email includes:
- Subject line (A/B variant)
- Preview text
- Email body (short paragraphs, mobile-scannable)
- CTA with specific link placeholder

## DM Outreach Workflow

```
/write-dms leads="[leads-csv-filename]"
```

For each lead in the CSV, write a personalized DM that:
- References ONE specific thing about their business
- Points out ONE specific gap or opportunity
- Ends with a soft, non-pushy ask
- Feels handwritten, not templated

Output as table: Business Name | Platform | DM Message

## Landing Page Copy Workflow

```
/write-landing client="[NAME]" service="[SPECIFIC SERVICE]" audience="[WHO WE'RE TARGETING]"
```

Writes copy for:
- Hero headline and sub-headline
- 3-4 service/benefit bullets
- Social proof section header
- About section copy
- FAQ answers (top 3 questions for this niche)
- Primary CTA button text
- Secondary CTA text

## Copy Scoring

```
/score-copy content="[paste any copy here]"
```

Score on:
1. **Hook strength** (1-10): Would this stop a scroll in 3 seconds?
2. **Voice authenticity** (1-10): Does it sound like a real person?
3. **Specificity** (1-10): Does it use real numbers and scenarios?
4. **CTA clarity** (1-10): Is it 100% clear what to do next?
5. **FTC compliance**: Flag any problematic claims

For any score below 7, rewrite that element immediately.

## Frameworks Reference

Draw on the direct-response canon. Use these as tools, not as a checklist to cram into every piece.

**Headlines (Caples, Ogilvy).**
- Specificity: exact numbers and timeframes ("booked 23 roof jobs in 41 days").
- Transformation: from [bad current state] to [desired state].
- Question: a yes-question the right prospect can't help answering.
- Reason-why: "The real reason your [thing] keeps [problem]."

**Openings (Halbert, Collier).** Enter the conversation already running in their head. Start with a story, a confession, a specific result, or a contrarian claim. Never "Hey guys" or "In today's world".

**Curiosity and open loops (Sugarman).** Open a loop in the first line, pay it off later so they keep reading. The only job of each sentence is to get the next one read (the slippery slide). Resolve every loop you open. No clickbait you don't deliver on.

**Flow.** Use bucket brigades ("Here's the catch:", "But it gets better:") to pull the reader down the page. Vary sentence length. Short line for impact. Then a longer one that breathes.

**Proof (Hopkins).** Reason-why copy: back every claim with a specific, checkable detail. Concrete beats clever.

**CTA.** Tell them exactly what to do next, once. Reduce friction at the ask: how long it takes, what happens after, why it is low-risk.

## Compliance Check Workflow

```
/check-compliance content="[paste copy here]" platform="[meta/google/tiktok/youtube/clickbank]"
```

Audit any ad, landing page, VSL, or email against platform policy before it runs. Default platform is Meta.

**9-point checklist:**
1. Personal attributes: no "you/your" copy that assumes the viewer's condition or implies their age, health, race, or finances.
2. Sensational or negative language: flag ruin, destroy, kill, wreck, terrible, worse, and similar.
3. Medical and health claims: soften to helps, supports, may, can. No disease names or cure claims.
4. Income and financial claims: no guarantees, no "lifetime access" (ClickBank).
5. Before and after: no side-by-side body comparisons (Meta). YouTube is more permissive.
6. Open loops and clickbait: resolve every loop, the product or offer name must be visible.
7. Trigger words: cross-check against the platform's known flagged terms.
8. Landing page elements: product visible without forcing a VSL, working exit navigation, no fake countdown timers.
9. Ad-to-page consistency: visuals and messaging match the destination, same domain, no bait-and-switch.

**Severity:**
- HIGH: likely rejection or account ban. Must fix.
- MEDIUM: risky, could be flagged. Should fix.
- LOW: minor, could catch a stricter review cycle.

**Output one block per issue:**
```
### Issue N [SEVERITY]
> "exact problematic text"
Rule: which point is violated and why
Rewrite: a compliant version that keeps the persuasive intent
```

**Score:** start at 10. Subtract 2 per HIGH, 1 per MEDIUM, 0.5 per LOW, floor at 0.
- 8 to 10: ready to run
- 5 to 7: needs fixes
- 0 to 4: major rewrite required

This checklist is adapted from Rob Palmer's Compliance Checker skill, used under CC-BY-4.0. Platform policies change. Treat this as a first-pass screen, not legal advice.
