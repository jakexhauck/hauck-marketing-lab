---
name: funnel-selection
description: Match offer type to optimal funnel architecture
primary-agent: stratos
expert-source: Media Buying Expert, Business Expert
---

# Funnel Selection Skill

## When to Use
- New offer launch planning
- Pivoting existing offer strategy
- Evaluating funnel-offer fit

## Funnel Types

### 1. Paid Challenge Funnel
```
BEST FOR:
- High-ticket ($2K-$25K+)
- Complex offers needing education
- Cold audiences that need warming
- Authority building

REQUIREMENTS:
- Budget: $200K+ (ads + production)
- Timeline: 8 weeks runway
- Team: Full team needed
- Show rate target: 70%

ECONOMICS:
- Front-end ROAS: 1.5-2.5x
- Back-end ROAS: 5-15x
- Combined: 8-20x (90 days)

STRUCTURE:
- Day 1: Vision + Possibility
- Day 2: Framework + Quick Win
- Day 3: Deep Dive + Obstacles
- Day 4: Implementation + Future
- Day 5: Offer + Close
```

### 2. Webinar Funnel
```
BEST FOR:
- Mid-ticket ($997-$5K)
- Authority-based offers
- Warm to cold audiences
- Information products

REQUIREMENTS:
- Budget: $50K+
- Timeline: 4 weeks
- Team: Presenter + support

ECONOMICS:
- Front-end ROAS: 2-4x
- Back-end ROAS: 3-6x

STRUCTURE:
- Live or evergreen
- 60-90 minute presentation
- Pitch in final 20 minutes
```

### 3. VSL Funnel
```
BEST FOR:
- Direct response
- Simple offers
- Warmer audiences
- Quick decisions

REQUIREMENTS:
- Budget: $25K+
- Timeline: 2 weeks
- Team: Minimal

ECONOMICS:
- ROAS: 2-5x expected

STRUCTURE:
- Video sales letter
- Direct to checkout
- Follow-up sequence
```

### 4. Call Funnel
```
BEST FOR:
- High-ticket ($5K-$50K+)
- Consultative sales
- B2B offers
- Custom solutions

REQUIREMENTS:
- Budget: $30K+
- Timeline: 3 weeks
- Team: Sales team required

ECONOMICS:
- CPL target: $100-500
- Close rate: 20-40%

STRUCTURE:
- Application page
- Qualification
- Sales call
- Follow-up
```

### 5. Low-Ticket/Self-Liquidating
```
BEST FOR:
- List building
- Proof of concept
- Lead generation
- Under $500 offers

REQUIREMENTS:
- Budget: $10K+
- Timeline: 2 weeks
- Team: Minimal

ECONOMICS:
- Break-even on front-end
- Profit on upsells/back-end

STRUCTURE:
- Simple sales page
- Order bump
- Upsell sequence
```

## Selection Matrix

```
DECISION TREE:

IF offer_price > R$10,000:
  IF needs education/trust:
    → PAID CHALLENGE
  ELSE:
    → CALL FUNNEL

IF offer_price R$2,000 - R$10,000:
  IF authority matters:
    → WEBINAR
  IF cold audience:
    → PAID CHALLENGE
  ELSE:
    → VSL

IF offer_price R$500 - R$2,000:
  IF complex product:
    → WEBINAR
  ELSE:
    → VSL

IF offer_price < R$500:
  → SELF-LIQUIDATING FUNNEL
```

## Output: Funnel Selection Report

```
FUNNEL SELECTION: {Offer Name}

OFFER ANALYSIS:
- Price: R${price}
- Type: {course/coaching/service}
- Complexity: {high/medium/low}
- Audience temp: {cold/warm/hot}

RECOMMENDED FUNNEL: {type}

RATIONALE:
1. {reason based on price}
2. {reason based on audience}
3. {reason based on complexity}

ECONOMICS PROJECTION:
- Investment: R${amount}
- Timeline: {X} weeks
- Expected front-end ROAS: {X}x
- Expected back-end ROAS: {X}x

ALTERNATIVE: {backup option}
When to pivot: {conditions}

NEXT STEPS:
1. {action}
2. {action}
3. {action}
```

## Expert Attribution
- **Media Buying Expert**: Challenge funnel economics, day structure
- **Business Expert**: Unit economics framework, LTV/CAC rules
