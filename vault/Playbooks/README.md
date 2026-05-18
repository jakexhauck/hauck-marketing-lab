---
type: playbooks-index
agent: all
tags: [playbooks, framework]
---

# Niche Playbooks

Each subfolder is a slug (kebab-case) that maps to the `niche:` field on a client's `Profile.md`. When a client carries a niche, every form prefill looks up `vault/Playbooks/<niche>/<field>.md` for a starting value before falling back to empty.

## Layout

Every playbook folder must contain six files. Missing files trigger a console warning on app start but never block usage.

- `audience.md` — voice-of-customer research. Motivations, objections, triggers, language. Prefills the Audience Research form's audience-heavy fields and the Ad Copy form's target-customer field.
- `offers.md` — the 3 to 5 offers that have worked for this niche, one per bullet. Prefills the Offer + CTA form, the Hooks form's offer field, and the Ad Copy form's current-offer field.
- `angles.md` — 10+ creative angles with sample hooks. Prefills the Hooks form's seed field and the Creative Brief form's core message.
- `creative-brief.md` — boilerplate visual style + do-nots for the niche. Prefills the Creative Brief form's visual-style and do-nots fields.
- `competitors.md` — typical competitor landscape patterns (not specific competitor names). Prefills the competitor-intel field on Ad Copy and Creative Brief when no Competitor Research has been run yet.
- `benchmarks.json` — performance targets. Shape:

```json
{
  "cpl_target": 40,
  "cpm_min": 15,
  "cpm_max": 35,
  "ctr_floor": 1.2,
  "roas_target": 4
}
```

## Precedence

When a form pulls a default for a field, the order is:

1. Explicit override on the form (Jake typed something).
2. `vault/Clients/<Name>/Profile.md` value for that field.
3. `vault/Playbooks/<niche>/<field>.md` value for that field.
4. Empty.

The form UI shows a small `auto · profile` or `auto · <niche> playbook` tag next to each prefilled field so the source is obvious before Jake clicks Generate.

## Adding a niche

Two routes:

1. **In-app:** Workspace → Niche Playbooks → Add niche. Fill the six fields in the modal; saves to `vault/Playbooks/<slug>/`.
2. **By hand:** create the folder, drop the six files in. The app picks it up on next refresh; benchmarks.json must be valid JSON.

## Starter playbooks shipped

- `dental` — family and cosmetic dentists.
- `gym-fitness` — local gyms and boutique fitness studios.
- `med-spa` — botox, fillers, body sculpting.

Jake will tune these as real client data accumulates.
