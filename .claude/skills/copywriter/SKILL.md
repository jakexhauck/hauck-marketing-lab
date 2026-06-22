---
name: copywriter
description: Write high-converting ads, emails, DMs, and scripts in any client's exact voice. Builds a voice profile from existing content, then produces copy that sounds like a real person — not AI. Use for all client copy needs.
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

Write 5 ad scripts each with a different hook angle:
1. Problem-focused hook
2. Result/transformation hook
3. Curiosity/question hook
4. Bold claim hook
5. Story hook

Each script includes:
- **Framework** (PAS / AIDA / BAB / STORY — see vault/Knowledge/ad-frameworks.md)
- **Angle** (one of the 12 from vault/Knowledge/ad-angles.md — different angle per ad)
- **Hook** (first 3 seconds): the exact opening line
- **Body** (what they say): full spoken script, 45-90 seconds
- **CTA**: exact closing line and call to action
- **Hook Score** (1-10): how likely this is to stop the scroll
- **Format note**: any visual direction needed

Rules for every script:
- No "hey guys" or "welcome to" openers
- Never use em dashes (universal Hauck Marketing rule)
- Use specific numbers wherever possible
- Sound like a real person, not a copywriter
- CTA must tell them exactly what to do next
- Run the 60-second edit process before delivering (vault/Knowledge/ai-anti-patterns.md)
- Kill the 6 AI anti-patterns on every draft

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
