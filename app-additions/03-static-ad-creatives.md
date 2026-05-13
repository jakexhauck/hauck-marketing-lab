# 3. Static Ad Creative Generator

## What it is
A sibling to `WebDesignerPage` that produces **HTML/CSS ad creatives** at ad-sized canvases
(1080×1080, 1080×1350, 1080×1920), then screenshots them to PNG. Six niche templates baked in,
matching the six niches in plan #2 (Freepik) so the two flows compose.

## Why we want it
We can already build landing pages. We can't produce the static image *ad* that drives traffic to
those pages. This plugs the hole and pairs naturally with the Freepik visuals workflow (use a
Nano Banana image as the hero asset inside the HTML template).

## Architecture fit
Strong precedent: `WebDesignerPage.tsx` + `web_designer.rs` is essentially the same pattern with
different output dimensions and prompts. Clone-and-adapt is the right call here.

## Implementation plan

### Step 1 — Backend module (`ad_creatives.rs`)
Two Tauri commands, mirroring the web-designer module:

```rust
#[tauri::command]
async fn ad_creatives_generate(args: AdCreativeArgs) -> Result<AdCreativeResult>;
// Builds the prompt from niche template + form fields.
// Runs `claude -p` to produce an HTML/CSS artifact.
// Saves the HTML to: media-buying/data/<client>/ad-creatives/<timestamp>-<slug>.html
// Screenshots to PNG at the requested dimensions (see Step 3 for screenshotting).
// Returns paths to both.

#[tauri::command]
async fn ad_creatives_list(client_slug: String) -> Result<Vec<AdCreativeEntry>>;
// Reads the ad-creatives folder, returns metadata for the gallery.
```

`AdCreativeArgs`:
```rust
struct AdCreativeArgs {
    client_slug: String,
    niche: String,                   // "dentist" | "gym" | ...
    dimensions: AdDimensions,        // Square | Vertical45 | Story
    headline: Option<String>,        // override default
    offer: Option<String>,
    hero_image_path: Option<String>, // from Freepik flow
    reference_image_paths: Vec<String>, // for visual style matching
}
```

### Step 2 — Six niche templates (in `app/src/lib/adTemplates.ts`)
Each template defines the *prompt skeleton*. Substitute fields at runtime.

| Niche | Format | Palette | Fonts | Hook |
|---|---|---|---|---|
| Dentist | 1080×1080 | Mint #E8F5E9 / Cream #FFF8E1 | Playfair Display + Inter | Before/after, "first visit shouldn't end in tears" |
| Gym (35-50yo dads) | 1080×1350 | Matte black #0A0A0A / Neon green #00FF88 | Bebas Neue + Inter | Transformation, "dropped 22 lbs without giving up beer" |
| Italian Restaurant | 1080×1080 | Cream #F5E9D0 / Brown #3E2723 | Caveat + Cormorant | Hand-written secret menu, "locals only" |
| Real Estate | 1080×1350 | Navy #0F1B2D / Champagne #C9A961 | Cormorant Garamond + Manrope | Sold listing flex, "$47K over asking in 8 days" |
| Hair Salon | 1080×1920 | Soft pink #F8E8E8 / Rose gold #B76E79 | Didot/Bodoni + sans | Before/after one-frame, "brunette → blonde in 4 hours" |
| Plumber | 1080×1080 | Red #C8102E / White | Oswald + Inter | Trust-builder, "We answer the phone. Apparently that's rare." |

Each template's prompt should include:
- Exact pixel dimensions.
- Palette and fonts (load via Google Fonts CDN inside the HTML).
- Layout description (before/after split, stats panel, urgency badge, etc).
- Placeholder slots for the substituted fields.
- Explicit instruction: "inline all CSS, no JavaScript, no external assets except the hero image
  if provided and Google Fonts."

The class also includes the exact CTAs and social proof patterns per niche — capture those in the
template so the model doesn't drift.

### Step 3 — Screenshot capture (cross-cutting decision)
HTML → PNG is needed here AND for any LP previews. Three options:

| Option | Pros | Cons |
|---|---|---|
| Bundle Playwright via Tauri sidecar | Reliable, cross-platform | ~150MB extra; sidecar wiring effort |
| Use WebView2 (Windows) / WKWebView (Mac) capture API | No extra deps | Platform-specific code; lower fidelity |
| Punt to a CLI tool (`shot-scraper`, `wkhtmltoimage`) | Trivial to invoke | User must install separately |

**Recommendation:** Playwright sidecar. It also unlocks landing-page screenshots and any future
"render this HTML to image" need.

Build a generic `screenshot_html(html_path, width, height) -> png_path` helper in a new
`app/src-tauri/src/screenshot.rs` and have `ad_creatives.rs`, `web_designer.rs`, and (later)
`pitch_decks.rs` all call it.

### Step 4 — Frontend page (`AdCreativesPage.tsx`)
Layout:

**Top bar:** Niche picker (six chips matching plan #2 palette).

**Left panel (form):**
- Dimensions toggle: Square / 4:5 / Story.
- Optional fields: headline override, offer/CTA override, "5 spots left"-style urgency line.
- Hero image picker — browses the client's `visuals/` folder (drops in Freepik output).
- Reference image drop-zone — accepts brand guidelines, competitor ads, screenshots. These get
  attached to the Claude call so it matches the visual style ("Visual Reference Matching" from the
  class).

**Right panel (preview):**
- Live HTML preview as the model streams.
- PNG screenshot tile below it once render completes.
- "Generate 9 more variations" button (the combo workflow — see plan #1 Step 5).
- "Open PNG" / "Reveal in Explorer" buttons.

### Step 5 — Reference-image attachment
`GenericFormGenerator` doesn't currently support image attachments. This is a small but real
extension to `tauri.ts` and the `claude -p` invocation — `claude -p` supports image input via
`--image <path>`. Add an optional `referenceImages: string[]` field to the prompt-runner.

This unlocks the "visual reference matching" technique across **all** generators (ads, pages,
decks), so do it once, properly.

## Acceptance criteria
- Pick "Plumber" niche, click Generate, see HTML preview in 10–15s, PNG saved to client folder.
- Override headline → regenerate → new variation respects override.
- Drop a competitor's ad PNG into the reference zone → output matches its visual feel.
- Pick a Freepik-generated image as the hero → it appears in the rendered ad.

## Effort estimate
- Screenshot module + Playwright sidecar bundling: 1 day.
- `ad_creatives.rs` + six templates: 1 day.
- `AdCreativesPage.tsx` + gallery: 1 day.
- Reference-image attachment plumbing: half a day.
- **Total: ~3.5 days.**

---

## Verbatim prompts — six niche ad creatives

These go into `app/src/lib/adTemplates.ts`, one per niche, with `[CITY]` (and `[NEIGHBORHOOD]`
for real estate) as substitutable placeholders.

### Family Dentist
```
Create an HTML ad creative, 1080x1080, square social-feed format. Niche: family dentist in [CITY]. Format: before/after comparison. Headline: "Your kid's first dental visit shouldn't end in tears." Style: warm and trustworthy. Mint #E8F5E9, cream #FFF8E1, modern serif headline (Playfair Display), Inter body. Include: 5-star badge, "247 happy families this year", soft photo placeholders labeled "ANXIOUS BEFORE" / "SMILING AFTER". CTA: "Book your free consult →" Output: a single HTML file with inline CSS, ready to screenshot at 1080x1080.
```

### Local Gym (35–50yo)
```
Create an HTML ad creative, 1080x1350, vertical Reels/Stories format. Niche: local gym in [CITY], target dads 35-50. Format: transformation + offer. Headline: "How Mike dropped 22 lbs at 47 — without giving up beer." Style: matte black #0A0A0A, neon green #00FF88, all-caps display (Bebas Neue), gritty industrial. Include: stats panel (-22 lbs / 16 weeks / 3x per week), pull-quote testimonial, "5 spots left — January cohort". CTA: "Claim your spot →" Output: single HTML, inline CSS, ready to screenshot at 1080x1350.
```

### Italian Restaurant
```
Create an HTML ad creative, 1080x1080. Niche: Italian family spot in [CITY]. Format: hand-written secret-menu special. Headline: "Wednesday's secret menu (locals only)" Style: warm chalkboard — cream #F5E9D0, brown #3E2723, Caveat handwritten headline, Cormorant for menu items. Include: 3 dishes + prices, "Walk-in only — 6 to 9 PM", italic line "(don't tell the tourists)". CTA: "See you Wednesday →" Output: single HTML, inline CSS, screenshot-ready.
```

### Real Estate Agent
```
Create an HTML ad creative, 1080x1350. Niche: realtor in [CITY], target home sellers. Format: sold-listing flex. Headline: "$47K over asking. In 8 days. In [NEIGHBORHOOD]." Style: editorial luxe — navy #0F1B2D, champagne #C9A961, Cormorant Garamond + Manrope. Include: before/after price tags, "8 days on market" badge, agent photo placeholder, 3-bullet "what we did differently". CTA: "Want yours sold like this? DM me 'PLAYBOOK'" Output: single HTML, screenshot at 1080x1350.
```

### Hair Salon / Colorist
```
Create an HTML ad creative, 1080x1920 Story format. Niche: hair colorist in [CITY], target women 25-45. Format: before/after one-frame. Headline: "Boring brunette → bombshell blonde in 4 hours." Style: editorial fashion mag — soft pink #F8E8E8, rose gold #B76E79, Didot or Bodoni headline, clean sans body. Include: two photo boxes labeled "9 AM" / "1 PM", price callout "$280 (worth $450)", booking urgency. CTA: "DM 'GLOW' to book this week →" Output: single HTML, screenshot at 1080x1920.
```

### Plumber / Home Services
```
Create an HTML ad creative, 1080x1080. Niche: local plumber in [CITY]. Format: trust-builder. Headline: "We answer the phone. (Apparently that's rare now.)" Style: blue-collar honest — red #C8102E, white, heavy condensed sans (Oswald) headline, Inter body. Include: 3 stats (24/7 / $0 quote / 4.9★ on 312 reviews), phone number HUGE, "No surprises, no hidden fees" badge. CTA: "Call now — we're 11 min away" Output: single HTML, screenshot at 1080x1080.
```

---

## Bonus: three landing-page prompts (for the existing WebDesigner page)

The class also includes three full landing-page prompts. These don't belong here — they belong
as new niche presets in the existing `WebDesignerPage.tsx`. Pasted here for reference; should
be migrated into `web_designer.rs` / `WebDesignerPage` next time those niche presets are touched.

### Dentist landing page
```
Build a complete one-page conversion site for a family dentist in [CITY]. Sections: 1) Hero "The dentist your kids actually ask to visit" + CTA "Book a free first visit" + trust strip. 2) The 3 promises (no shaming about flossing / no surprise bills / no scary kids' visits). 3) 3 testimonial cards. 4) Meet Dr. [LAST NAME] — photo + 4-paragraph bio focused on family + community. 5) Services grid — 6 cards. 6) FAQ — 7 questions, accordion via details/summary. 7) Final CTA + map + phone + booking form. Visual: warm trust theme. Mint #5DD3B3, cream #FFF8E1, Playfair Display + Inter. Mobile-first. Output: single HTML file, inline CSS, complete with realistic placeholder copy, no JS.
```

### Gym landing page
```
Build a one-page sales site for a local gym in [CITY] selling a 12-week transformation program for dads 35-50. Sections: 1) Hero "Lose the dad bod in 12 weeks. Without giving up your life." + video placeholder + CTA. 2) Who this is for / not for — two-column. 3) Transformation — 3 before/after card placeholders with stats. 4) The 12-week system — 4 phases on a horizontal timeline. 5) What's included — 6 deliverables with checkmarks. 6) Investment + 30-day money-back guarantee. 7) Coach bio + facility photos. 8) FAQ — 8 questions, accordion. 9) Final CTA — application form, "5 spots left" urgency. Visual: matte black #0A0A0A, neon green #00FF88, Bebas Neue + Inter. Mobile-first. Output: single HTML file, inline CSS.
```

### Real estate landing page
```
Build a one-page lead-magnet site for a realtor in [CITY] targeting home sellers. Lead magnet: free home valuation report. Sections: 1) Hero "Find out what your [CITY] home is worth in 2026 — free, in 24 hours" + form (address + email + phone) + trust strip. 2) How the report works — 3 steps. 3) Recent sold listings — grid of 6. 4) Why list with [AGENT] — 5 differentiators + agent photo. 5) Testimonials — 3 cards. 6) FAQ — 6 questions. 7) Final CTA — same form repeated. Visual: editorial luxe — navy #0F1B2D, champagne #C9A961, Cormorant Garamond + Manrope. Mobile-first. Output: single HTML file, inline CSS.
```
