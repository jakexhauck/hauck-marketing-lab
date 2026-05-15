# Pre-Launch QA Checklist

**Category:** Build & Launch
**Source:** Module 3 Lesson 1 (Phase 5), Module 3 Lesson 7 (Nexus checks), Module 5 Lesson 13
**When to use:** Before publishing any new campaign. No exceptions.
**Estimated time:** 10 min

---

## Prerequisites

- [ ] Campaign fully built but not published
- [ ] All ads uploaded
- [ ] Creatives client-approved

## Checklist

- [ ] **Tracking:**
  - [ ] Pixel installed and firing (verified with Pixel Helper)
  - [ ] Conversion event set up in Events Manager (Lead, Purchase, etc.)
  - [ ] Conversion event selected at ad set level
- [ ] **Targeting:**
  - [ ] Location set correctly (address + radius per business type)
  - [ ] Age range matches client offer
  - [ ] No interests stacked (broad only)
  - [ ] Audience Network EXCLUDED from placements
- [ ] **Budget and schedule:**
  - [ ] Daily budget matches what client agreed
  - [ ] Schedule set (start date, end date if applicable)
  - [ ] Bid strategy set (default: lowest cost)
- [ ] **Creative:**
  - [ ] Advantage Creative toggles OFF on every ad
  - [ ] All ads proofread (no typos)
  - [ ] Image and video dimensions correct (1:1 for feed, 9:16 for stories/reels)
  - [ ] CTA button matches the objective (Get Quote, Book Now, Sign Up, etc.)
  - [ ] Landing page URL pasted correctly on every ad
  - [ ] UTM parameters added to URLs (utm_source=facebook, utm_campaign=[name])
- [ ] **Page and identity:**
  - [ ] Correct Facebook Page selected
  - [ ] Instagram account linked (if running IG placements)
- [ ] **Policy:**
  - [ ] No before/after health claims without "Results may vary" disclaimer
  - [ ] No income or earnings claims
  - [ ] No personal attributes targeting language in copy ("Are you overweight?")
  - [ ] Special Ad Category set if housing, credit, employment, or politics
  - [ ] No misleading or exaggerated claims
- [ ] **Naming:**
  - [ ] Campaign name follows convention: [Client] - [Goal] - [Type]
  - [ ] Ad set name follows convention: [Audience] - [Location] - [Age]
  - [ ] Ad name follows convention: [Format] - [Hook/Angle] - [Version]
- [ ] **Diversity:**
  - [ ] Vortex check passed (15+ creatives across 4+ formats)
- [ ] **Mobile preview:**
  - [ ] Every ad previewed on mobile (95% of users on phones)

## Notes

- Run this entire list every time. The 60 seconds you save by skipping is the 3 hours you spend fixing a wrong URL after spend has started.
- If anything fails, fix it before publish. Do not "launch and fix later."
- Once published, the campaign enters the Learning Phase. Edits during this window reset it.

## Related SOPs

- campaign-structure-naming
- targeting-setup-broad
- vortex-creative-diversity-check
- meta-pixel-install-gtm
- troubleshooting-playbook
