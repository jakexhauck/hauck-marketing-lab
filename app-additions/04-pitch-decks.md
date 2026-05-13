# 4. Pitch Deck Generator

## What it is
A single-prompt generator that produces a **12-slide HTML pitch deck** for client proposals.
Snap-scroll behavior, fullscreen sections, glassmorphism cards, no JavaScript. Lives at the sales
stage of the workflow.

## Why we want it
Lowest priority of the four — it doesn't help delivery margin (which is where the other three add
real money). But it does compress proposal-prep from "half a day in Keynote" to ~15 minutes,
which matters when Jake's running a lot of pitches.

## Architecture fit
This is the simplest of the four. Single form, single prompt, single HTML output. Slots into the
existing `formConfigs.ts` as `phase: 1, phaseName: "Close the Deal"`. No new backend module
needed — reuses the existing `generators.rs` / `claude -p` plumbing.

## The 12-slide structure (from the class)
1. **Cover** — agency name + client name.
2. **The opportunity** — one stat + one sentence.
3. **Where they are now** — 3 honest observations (pulled from a pre-pitch audit if available).
4. **Where they could be in 90 days** — 3 outcomes with targets.
5. **The strategy** — funnel diagram.
6. **Month 1** — deliverables + 1 KPI.
7. **Month 2** — deliverables + 1 KPI.
8. **Month 3** — deliverables + 1 KPI.
9. **Sample creative** — 3 ad mockups (link/embed from plan #3 outputs).
10. **The team** — 3 cards.
11. **Investment** — tiered pricing with "recommended" tier highlighted.
12. **Guarantee + next step** — "Sign here" CTA.

Visual style: customizable background + accent color, Space Grotesk headlines, Inter body,
glassmorphism cards, each slide `height: 100vh`, `scroll-snap-type: y mandatory`.

## Implementation plan

### Step 1 — New form config in `formConfigs.ts`

```ts
const PITCH_DECK: FormConfig = {
  id: "pitch-deck",
  title: "Pitch Deck Builder",
  subtitle: "12-slide HTML deck for client proposals",
  eyebrow: "▸ PITCH DECK · VORTEX",
  category: "phase",
  phase: 1,
  phaseName: "Close the Deal",
  phaseMeta: "Sales",
  agentSlug: "vortex",
  agentName: "Vortex",
  kind: "html",                    // saved as .html, not .md
  savedHeading: "Pitch deck saved",
  generateLabel: "Generate deck",
  generatingLabel: "Generating…",
  sections: [
    {
      title: "Client",
      fields: [
        { kind: "text", key: "clientName", label: "Client name", required: true,
          promptPlaceholder: "[CLIENT NAME]" },
        { kind: "textarea", key: "opportunity", label: "The opportunity (one stat + sentence)",
          promptPlaceholder: "[OPPORTUNITY]" },
        { kind: "textarea", key: "observations",
          label: "3 honest observations about where they are now",
          promptPlaceholder: "[OBSERVATIONS]" },
        { kind: "textarea", key: "outcomes", label: "3 targets for 90 days",
          promptPlaceholder: "[OUTCOMES]" },
      ],
    },
    {
      title: "Pricing",
      fields: [
        { kind: "textarea", key: "tiers",
          label: "Pricing tiers (mark recommended with *)",
          promptPlaceholder: "[TIERS]" },
        { kind: "text", key: "guarantee", label: "Guarantee line",
          promptPlaceholder: "[GUARANTEE]" },
      ],
    },
    {
      title: "Style",
      fields: [
        { kind: "text", key: "accent", label: "Accent color (hex)",
          promptPlaceholder: "[ACCENT]" },
        { kind: "select", key: "vibe", label: "Vibe",
          options: ["Editorial", "Tech", "Luxe", "Gritty"],
          promptPlaceholder: "[VIBE]" },
      ],
    },
  ],
  promptTemplate: PITCH_DECK_PROMPT, // see Step 2
  defaultTitle: "Pitch deck",
  prefillFromProfile: {
    clientName: "businessName",
  },
};
```

### Step 2 — The master prompt (verbatim from the class)
Drop into a new file `app/src/lib/pitchDeckPrompt.ts`. Placeholders: `[NICHE]`, `[CITY]`,
`[CLIENT NAME]`, `[AGENCY NAME]` — all substituted from form fields / active client profile.

```
Build a complete client pitch deck as a single HTML file with each slide as a fullscreen section (snap-scroll). Use case: I'm an ad agency pitching a [NICHE] client in [CITY] on a 90-day campaign. Slides: 1) Cover + "[CLIENT NAME] x [AGENCY NAME] — 90-Day Growth Plan". 2) The opportunity — 1 stat + 1 sentence. 3) Where they are now — 3 honest observations. 4) Where they could be in 90 days — 3 outcomes with target numbers. 5) The strategy — funnel diagram. 6/7/8) Month 1, 2, 3 — deliverables list + 1 KPI each. 9) Sample creative — 3 ad mockups. 10) The team — 3 cards. 11) Investment — single tiered pricing card with one bold "recommended" tier. 12) Guarantee + next step + "Sign here" CTA. Visual: my agency brand — bg #0A0A0F, accent #4d8eff, Space Grotesk headlines, Inter body, glassmorphism cards. Each slide centers vertically, 100vh tall. Output: single HTML, inline CSS, scroll-snap, no JS.
```

Form field map:
- `niche` → `[NICHE]`
- `city` → `[CITY]` (prefill from `Profile.md` location)
- `clientName` → `[CLIENT NAME]` (prefill from `Profile.md` businessName)
- `agencyName` → `[AGENCY NAME]` (default "Hauck Marketing")

The other detail fields from Step 1 (`opportunity`, `observations`, `outcomes`, `tiers`,
`guarantee`, `accent`, `vibe`) can be added as **additional context** appended to the master
prompt, e.g.:

```
Use these specifics: opportunity = [OPPORTUNITY]; observations = [OBSERVATIONS]; outcomes = [OUTCOMES]; pricing tiers = [TIERS]; guarantee = [GUARANTEE]; accent color override = [ACCENT]; vibe override = [VIBE].
```

### Step 3 — Optional: pull data from pre-pitch audit
If plan #1 (Meta Ads MCP) is built first, add an "Auto-fill from pre-pitch audit" button that
reads the most recent audit for this client and pre-populates `opportunity`, `observations`, and
`outcomes`. This is what makes the deck *fast* — most of the writing is already done.

### Step 4 — Optional: pull creative samples from plan #3
Slide 9 ("Sample creative") is a placeholder. If plan #3 (Ad Creatives) is built, swap the
placeholders for the three most recent ad PNGs for this client.

## What's out of scope for v1
- **PDF export.** HTML is enough for screen-shared pitches and DocSend-style sharing. PDF
  conversion is a follow-up if Jake needs to leave a deck behind.
- **Editable slides post-generation.** If a slide is wrong, regenerate. Don't build a slide editor.

## Acceptance criteria
- Fill the form, click Generate, get a 12-slide HTML file opened in the default browser.
- Scroll snaps to each slide cleanly.
- Accent color is consistently applied.
- File is saved to `media-buying/data/<client>/decks/<timestamp>-pitch.html`.

## Effort estimate
- Form config + prompt: 2 hours.
- `kind: "html"` save handling (if not already supported): 1 hour.
- Testing across 3-4 real prospect scenarios: 2 hours.
- **Total: ~half a day.**

## Why this is last
The other three plans compound on each other: live data (plan #1) feeds the audit that fills the
deck (plan #4), Freepik (plan #2) feeds the ad creatives (plan #3) that fill slide 9. So pitch
decks are most valuable *after* the upstream pieces exist. Building it standalone now means
slides 9 and 3/4 stay manual.
