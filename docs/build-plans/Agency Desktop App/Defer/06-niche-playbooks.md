# 05 — Niche playbook library

> **Status:** Proposed. Build last of the five.
> **Effort:** 2 days for the framework + first 3 niches. Each additional niche ~2 hours of content writing once the framework exists.
> **Why this matters:** Every new client today starts from zero. Niches are not zero — dental clinics in Tampa share 80% of their audience, objections, offers, and creative angles with dental clinics in Austin. Mining that 80% per-niche turns Day-1 onboarding from "research and write" into "pick + customize."

---

## Why this matters

The forms are generic by design. That's right for the framework. But when you've run Vortex/Stratos/Nexus for 4 dental clinics, you've answered "what's the audience research" four times with nearly the same answers. The fifth client should inherit them.

This is also the highest-leverage place to put the agency's accumulated knowledge — distinguishing Hauck Marketing from a stack of generic AI agents. A niche playbook is the moat.

## What we have today

- 17 forms, all generic.
- `vault/Knowledge/` already exists as a place for frameworks retrieved by tag.
- `prefillFromProfile` shows the pattern for pre-loading form values from a stored source.
- Niche field exists in `Profile.md` already (geography is captured, niche is not yet explicit).

## What "done" looks like

1. **`vault/Playbooks/<niche>/` directory** per supported niche. First three: `dental`, `gym-fitness`, `med-spa`.
2. **Each playbook contains:**
   - `audience.md` — proven audience research (motivations, objections, triggers, language).
   - `offers.md` — 3–5 offers that have worked + angle for each.
   - `angles.md` — 10+ creative angles with sample copy hooks.
   - `creative-brief.md` — UGC + studio brief boilerplate.
   - `competitors.md` — typical competitor landscape patterns.
   - `benchmarks.json` — CPL target, CPM range, CTR floor, ROAS target.
3. **New-client flow gets a niche picker.** First step in onboarding form: niche dropdown. Selecting `dental` auto-fills:
   - `Profile.md` benchmarks.
   - `audience-research` form prefilled from `audience.md`.
   - `offer-cta` form prefilled from `offers.md`.
   - `ad-copy` form's USP field gets a niche-default starter.
   - `creative-brief` prefilled.
4. **Jake customizes, never authors.** Each field shows the niche default with an `auto · from dental playbook` badge. Editing keeps the override; leaving accepts the default.
5. **Reverse-flow capture.** When Jake makes a non-obvious edit to a niche-default field across multiple clients, surface a prompt: "Update the dental playbook with this?" Cumulative learning.

## Build steps

1. **Playbook schema.**
   - Document the file shapes in `vault/Playbooks/README.md`.
   - Add `niche` field to `Profile.md` (key: `niche`, value: slug like `dental`).
   - Validate playbook on app start; soft-fail with warning if a niche directory is incomplete.

2. **Niche-aware prefill.**
   - Extend `prefillFromProfile` to support `prefillFromPlaybook` — same shape, looks up `vault/Playbooks/<client.niche>/<field>.md`.
   - Precedence: explicit form override > Profile.md > Playbook default > empty.
   - Show source badge per field: `auto · profile` or `auto · dental playbook`.

3. **First three playbooks (content work, not code).**
   - `dental` — most established niche in Hauck Marketing. Start here.
   - `gym-fitness` — second most common.
   - `med-spa` — third, plus distinct enough from dental to validate the abstraction.
   - Each playbook authored by Jake (or extracted from past client folders if good ones exist).

4. **Picker UI.**
   - In the new-client flow, add a `Niche` dropdown with available playbook slugs (read directories under `vault/Playbooks/`).
   - "Custom (no playbook)" option for niches we haven't built yet.

5. **Reverse-flow capture (phase 2).**
   - Track edits per field per client. If the same edit appears 3+ times against the same niche default, prompt Jake on the Morning Briefing: `▸ Update dental playbook? 3 clients now override the default offer to include free whitening.`

## Open decisions

- **Where do existing-client niches get stored without a Profile.md migration?** Recommend writing the niche during a one-time pass: open each existing client, ask Jake to pick the niche, write back to Profile.md.
- **Which 3 niches first?** Recommend dental, gym, med-spa. Confirm with Jake — could be home services / legal / chiropractic depending on actual client mix.
- **Sharing playbooks across agencies (if Jake ever sells the app).** Out of scope; flag for later — playbooks are valuable IP and should not be in the open-source distribution if one happens.

## Out of scope

- Multi-niche clients. One niche per client. If a client truly straddles, pick the dominant niche.
- Auto-generating playbooks from past client folders. Manual authoring for v1; automation is a separate doc.
- Playbook versioning. Just `git` the vault; that's the version history.

## Effort + leverage

- 2 days code + framework.
- 2 hours per niche thereafter, content-only.
- Day-1 onboarding time per new client drops by ~60–70% within the first 3 niches.
