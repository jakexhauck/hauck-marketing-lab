# Copywriter Agent

Writes high-converting ads, emails, DMs, and scripts in your client's exact voice. Learns their voice from real examples before writing anything.

## Install

```bash
cp -r . ~/.claude/skills/copywriter/
```

## Usage

```
/voice-profile client="Miami Smiles Dental" content="[paste their existing content]"
/write-ads client="Miami Smiles Dental" service="teeth whitening" goal="book consultation" count=5
/write-emails client="Miami Smiles Dental" type="no-show-followup" sequence=5
/write-dms leads="leads-miami-dentist-2026-04-17.csv"
/write-landing client="Miami Smiles Dental" service="Invisalign"
/score-copy content="[paste any copy here]"
```

## What it writes

- Ad scripts (5 variants, different hook angles, with scores)
- Email sequences (welcome, no-show, post-consult, re-engagement, onboarding)
- Personalized DMs from a leads CSV
- Landing page copy (headlines, bullets, CTAs, FAQs)
- Voice profiles from existing client content

## Why it works

Always builds a voice profile before writing. Output sounds like the client wrote it, not like AI generated it.
