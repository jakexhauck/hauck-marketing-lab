---
name: campaign-structure
description: Andromeda-aligned campaign architecture for Meta Ads
primary-agent: aurelius
expert-source: Performance Expert, Media Buying Expert
---

# Campaign Structure Skill

## When to Use
- Setting up new campaigns
- Restructuring underperforming accounts
- Moving from old-school to Andromeda structure

## The Andromeda Structure

### Mandatory Architecture
```
ACCOUNT STRUCTURE:
1-2 campaigns MAXIMUM
├── Campaign 1: Main offer
│   ├── Ad Set 1: Broad (no targeting)
│   │   └── 15-25 diverse creatives
│   ├── Ad Set 2: Retargeting (if needed)
│   │   └── 10-15 creatives
│   └── Ad Set 3: Testing (optional)
│       └── 5-10 new creatives
│
└── Campaign 2: Secondary offer (if applicable)
    └── Same structure
```

### Campaign Types
| Objective | Campaign Type | When |
|-----------|---------------|------|
| Purchases | Advantage+ Sales | E-commerce |
| Leads | Advantage+ Leads | Lead gen |
| Registrations | Conversions | Challenges, webinars |

### Ad Set Configuration
```
TARGETING:
□ Broad (no restrictions) - DEFAULT
□ Age range only if necessary (18-65+)
□ Country only
□ NO interests
□ NO lookalikes
□ NO detailed targeting expansion

BUDGET:
□ Campaign Budget Optimization (CBO) preferred
□ OR Ad Set Budget if testing
□ Minimum: $50/day per ad set

PLACEMENTS:
□ Advantage+ Placements (automatic)
□ Manual only if performance data demands
```

### Creative Requirements
```
PER AD SET:
□ Minimum: 15 creatives
□ Ideal: 20-25 creatives
□ Maximum: 50 (diminishing returns)

DIVERSITY:
□ 5+ different angles/motivations
□ Mix of formats (video, static, carousel)
□ Different hooks per creative
□ NO minor variations of same angle
```

## Anti-Patterns (What NOT to Do)

```
❌ 5+ campaigns for same offer
❌ Multiple ad sets with similar audiences
❌ Interest-based targeting
❌ Lookalike audiences as primary
❌ Less than 10 creatives per ad set
❌ Same angle with different headlines
❌ Manual placements by default
```

## Output: Campaign Structure Document

```
CAMPAIGN STRUCTURE: {Client/Offer}
DATE: {Date}

CAMPAIGN 1: {Name}
├── Objective: {type}
├── Budget: ${amount}/day (CBO)
├── Optimization: {event}
│
├── AD SET 1: Broad
│   ├── Targeting: Country only
│   ├── Age: 18-65+
│   ├── Budget: Automatic (CBO)
│   └── Creatives: {X} ({Y} angles)
│
└── AD SET 2: Retargeting
    ├── Audience: {custom audience}
    ├── Exclusions: {converters}
    └── Creatives: {X}

CREATIVE SUMMARY:
- Total creatives: {X}
- Formats: {breakdown}
- Angles covered: {list}

LAUNCH CHECKLIST:
□ Pixel verified
□ CAPI configured
□ Creatives approved
□ UTMs configured
□ Conversion event set
```

## Expert Attribution
- **Performance Expert**: Andromeda Method structure
- **Media Buying Expert**: Budget allocation principles
