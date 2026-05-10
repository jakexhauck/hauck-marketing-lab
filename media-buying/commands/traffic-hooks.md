# /traffic hooks - Generate Hook Variations

Quick access to @vortex hook generator using 100 Hook Framework.

## Usage
```
/traffic hooks {product/offer}
```

## What It Does

1. Activates @vortex (Creative Architect)
2. Runs hook-generator skill
3. Returns 10-20 hook variations across 7 categories

## The 100 Hook Framework Categories

1. **Urgency & Scarcity** - "Only X spots left..."
2. **Social Proof & Authority** - "2,847 people already..."
3. **Problem Agitation** - "Tired of...?"
4. **Curiosity Gap** - "The secret to..."
5. **Transformation & Outcome** - "From $0 to $50K..."
6. **Tactical & Specific** - "3 steps to..."
7. **Industry Disruption** - "Forget everything about..."

## Output Format

```
HOOKS FOR: {Product}

### URGENCY HOOKS
1. {hook}
2. {hook}

### SOCIAL PROOF HOOKS
3. {hook}
4. {hook}

[continues for all 7 categories]

TOP 5 RECOMMENDATIONS:
1. "{hook}" - Why: {reason}
2. "{hook}" - Why: {reason}
...

DIVERSITY SCORE: X/7 categories
```

## Example

```
User: /traffic hooks Example Product

Vortex: HOOKS FOR: Example Product

URGENCY:
1. "47 spots left. When they're gone, they're gone."
2. "Doors close in 72 hours"

SOCIAL PROOF:
3. "2,847 brand owners already scaled using this"
4. "After helping 500+ agencies..."

CURIOSITY:
5. "The algorithm hack Meta doesn't want you to know"
6. "What your media buyer isn't telling you..."

[continues...]

TOP 5 RECOMMENDATIONS:
1. "The 3-second hook that 3x'd ROAS overnight"
   Why: Curiosity + specific result
```

## Related Commands
- `/traffic` - Full Traffic Command activation
- `/traffic diagnose` - When hooks aren't working
