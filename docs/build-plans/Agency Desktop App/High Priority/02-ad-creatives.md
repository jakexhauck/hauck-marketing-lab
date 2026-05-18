# Ad Creatives, image + video + HTML composite

> Status: V1 shipped, awaiting smoke test. V2 and V3 proposed.
> Effort: V1 = one smoke test. V2 (Freepik video) = ~1 day. V3 (HTML composer) = ~3.5 days.
> Why this matters: We can write copy and analyze data but cannot produce the actual visual ad. This closes the loop.
> Depends on: nothing for V1. V3 benefits from V1 + V2 outputs as inputs.

## Three paths, one surface

This used to be three separate docs (activation runbook, Freepik image + video, HTML/CSS templates). They all answer "make the ad visual" with different output types. Treat them as three stages of the same surface:

| Version | Output | Status |
|---|---|---|
| **V1** | Photorealistic stills via Google AI Studio (Nano Banana 2 / `gemini-3-pro-image-preview`) | Code shipped, awaiting smoke test |
| **V2** | Add 5-second motion video via Freepik (Seedance) | Proposed |
| **V3** | HTML/CSS composite ads (six niche templates), screenshot to PNG | Proposed |

V1 is the baseline. V2 layers motion on top of any V1 still. V3 is a different output entirely (composed ads with headline + CTA + hero image baked in), and a V1 or V2 image can be the hero asset inside a V3 composite.

---

## V1, Static images via Google AI Studio (ACTIVATION RUNBOOK)

> Code is wired end-to-end. Typecheck + cargo check both pass. Delete this section after one successful generation.

### What got built

A media-buying form (`ad-creative`) that:

1. Pulls the 12 ad-copy variations from the prior sequence step.
2. Lets you tick which ads to render at which dimensions (1:1, 9:16, 4:5, 16:9).
3. Asks Claude to draft a Nano Banana 2 prompt per (ad × dimension) pair, emitted as JSON.
4. Calls Google AI Studio (`gemini-3-pro-image-preview`) for each prompt.
5. Saves PNGs to `vault/Clients/<name>/Assets/<YYYY-MM-DD>-creatives/`.
6. Appends an `## Image generation` footer to the saved brief listing every saved path and any per-prompt failure.

Sits between `Generate ad copy` and `Send for approval` in the media buying sequence.

### Files touched

| File | What changed |
|---|---|
| `app/src-tauri/src/gemini_image.rs` | **New.** `generate_nano_banana_image` + `generate_creative_set` Tauri commands. Model ID lives at line 13 (`MODEL_ID`). |
| `app/src-tauri/src/lib.rs` | Module declared + both commands registered in the invoke handler. |
| `app/src-tauri/src/config.rs` | Added `gemini_api_key: Option<String>` to `AppConfig`. |
| `app/src/components/SettingsPage.tsx` | New "Google AI Studio" panel: paste / reveal / clear API key. |
| `app/src/lib/types.ts` | `gemini_api_key` on `AppConfig`; new `CreativePrompt`, `CreativeImageResult`, `CreativeBatchResult`, `CreativeBatchError` types. |
| `app/src/lib/tauri.ts` | `generateNanoBananaImage` and `generateCreativeSet` API wrappers. |
| `app/src/lib/formConfigs.ts` | New `AD_CREATIVE` config registered in `ALL_FORM_CONFIGS`. `imageGeneration` flag on `FormConfig`. |
| `app/src/lib/mediaBuyingSequence.ts` | New `ad-creative` step. `ChainSpec.rawBodyField` escape hatch. `SequenceState.driveFolderId`. |
| `app/src/lib/onboardingPlan.ts` | New `04-creatives` checklist task in phase 3. |
| `app/src/components/MainDashboard/ClientSequence.tsx` | Chain reader honors `rawBodyField`; `driveFolderId` preserved across sequence writes. |
| `app/src/components/GenericFormGenerator.tsx` | `runImageGeneration` post-processor, kicks in when a form sets `imageGeneration.provider = "nano-banana-2"`. |

### Activation steps

**1. Get a Google AI Studio API key.**
- Open `https://aistudio.google.com/apikey`.
- Sign in with the Google account you want billed.
- Click **Create API key** and copy the value.
- Make sure the project has the **Generative Language API** enabled (AI Studio prompts for this on first key creation).

**2. Paste the key into the app.**
- Restart the Tauri dev server: `pnpm tauri dev` from `app/`. (Required: the Rust backend changed, so the dev binary needs a rebuild.)
- Open **Settings** in the app.
- Scroll to the **Google AI Studio** panel.
- Paste the key. Click **Save key**. Panel switches to masked display.

The key writes to `config.json` under `gemini_api_key`. Never commit `config.json`.

**3. Smoke test (one ad, one dimension).**
- Pick a client where the **Generate ad copy** step is already done.
- Open the media buying sequence and click into the new **Build static creatives** step.
- The prior ad-copy markdown auto-fills the reference field.
- Under **Pick ads per dimension**, tick exactly **Ad 1** under Square (1:1).
- Leave the rest of the form on defaults.
- Click **Build creative prompts**.

What you should see:
- Claude streams the JSON block, then the markdown summary.
- The footer is augmented with `## Image generation` listing one saved PNG path.
- A `vault/Clients/<name>/Assets/<today>-creatives/ad-1-1x1.png` file exists.

If that works, run the full set: tick whatever combinations you actually want.

### If the first generation fails

The Gemini API shape was written from documentation, not verified against a live call. If you see one of these errors in the saved brief footer, ping me with the exact error string:

| Error | Likely cause | Fix location |
|---|---|---|
| `gemini 404` | Wrong model ID slug. Probably needs to be `gemini-2.5-flash-image` or a different preview suffix. | `app/src-tauri/src/gemini_image.rs:13` (the `MODEL_ID` constant) |
| `gemini 400` | Wrong request key shape (e.g. `aspectRatio` lives somewhere else in the body). | `app/src-tauri/src/gemini_image.rs:53-58` (the `generationConfig` block) |
| `gemini response missing inlineData.data` | Response shape differs. | `app/src-tauri/src/gemini_image.rs:81` (the `value.pointer(...)` path) |
| `gemini 403 / PERMISSION_DENIED` | API key valid but Generative Language API not enabled. | Google AI Studio dashboard. |
| `gemini 429` | Per-minute rate limit. | Lower the batch size or wait a minute. |

Every fix is a single-line change in `gemini_image.rs`. The frontend does not need to change.

### Not built yet (V1.5 work)

1. **Automatic Google Drive upload.** The Drive folder ID is captured per-client (sticky on `onboarding.json` under `sequence.driveFolderId`) and printed in the saved brief footer, but the upload step is manual. Wiring `drive_upload.rs` to sync the assets folder is the next task.
2. **Parallel image generation.** Calls are serial: one PNG at a time. Eight prompts takes one to two minutes. Parallelising is straightforward when latency becomes a pain point.
3. **Real ad-headline labels in the picker.** The 12 ad slots show as `Ad 1`...`Ad 12`. You read the chained ad-copy markdown to know which slot is which framework. A v2 could parse the markdown and label the checkboxes with framework + word count.

### Where the state lives

- API key: `config.json` (per-user, gitignored).
- Per-client Drive folder ID: `vault/Clients/<name>/onboarding.json` under `sequence.driveFolderId`.
- Rendered PNGs: `vault/Clients/<name>/Assets/<YYYY-MM-DD>-creatives/`.
- Saved brief markdown: wherever `saveGeneratorOutput` writes briefs for that client (the standard generator output folder).

### Delete this section when

You have run one full creative set successfully, the PNGs landed in the vault, and you have confirmed Jake's voice / brand show up in the renders. At that point memory + git history are the lasting record.

---

## V2, Add video via Freepik (Seedance)

### What changes

Freepik's API exposes Nano Banana (still images, redundant with V1) **and Seedance** (image-to-video, 5-second clips, natural motion). V2 wires Freepik specifically for Seedance, taking a V1 still and animating it.

### Backend module (`visuals.rs`)

```rust
#[tauri::command]
async fn visuals_animate_image(image_path: String, motion_prompt: String, client_slug: String) -> Result<String>;
// POST to Freepik /v1/ai/image-to-video (Seedance model) with the V1 still.
// Polls until rendered (5-30s). Saves MP4 next to the source PNG.
// Returns the absolute path.

#[tauri::command]
async fn visuals_list_outputs(client_slug: String) -> Result<Vec<VisualEntry>>;
// Reads visuals + creative folders, returns metadata for gallery view.
```

Polling is required, Freepik renders take 5-30 seconds. Use the existing event-emission pattern (`events.rs`) to stream `visuals-status` events back to the UI for a live progress indicator. Build the progress stream from day one or a 30-second wait with no feedback feels broken.

### Credentials

Add `freepik_api_key` to the SOPS-managed credentials. Wire it through `credentials.rs` so `visuals.rs` can read it without re-implementing decryption.

### UI

In the existing AdCreative form, each rendered V1 still gets an "Animate this" button. Opens a small panel with a motion-prompt textarea defaulting to the niche-appropriate motion (table below).

### Niche recipe library

Store in `app/src/lib/visualRecipes.ts`. Each niche has a default motion prompt (full verbatim image + motion prompts at the bottom of this doc):

| Niche | Default motion |
|---|---|
| Dentist | Dentist lifts mirror, smiles, thumbs-up. Child laughs. 5s. |
| Gym | Completes deadlift, racks bar, exhales, confident nod. 5s. |
| Restaurant | Camera pushes in. Pizza placed on table. Hand takes slice with cheese pull. 5s. |
| Real Estate | Camera tracks left, realtor turns, mouths "sold". 5s. |
| Hair Salon | Flips hair side to side, laughs, blows kiss. 5s. |
| Plumber | Finishes tightening, stands, thumbs-up. Homeowner laughs and nods. 5s. |

### Out of scope for V2

- Upscaling / face refinement. Freepik has these endpoints; skip until base flow is solid.
- Bulk generation (10 variations at once). Single image at a time for v2.
- Lip-sync. Seedance supports it, but needs an audio track input. Separate feature.

### Risks

- **Cost per render.** Seedance is roughly $0.10/sec of video. UI must show cost estimate before each generation so Jake doesn't burn $20 by accident.
- **NSFW / IP filters.** Freepik rejects certain prompts. Surface the rejection message clearly rather than failing silently.

### Acceptance criteria

- Click "Animate this" on a V1 still → 5s MP4 saved next to the PNG.
- Cost-per-render is visible before submitting.
- Gallery shows all prior assets for the selected client.

### Effort

- SOPS credential wiring: 2 hours.
- `visuals.rs` (Seedance endpoint + polling + event stream): half a day.
- UI integration into existing AdCreative form: ~3 hours.
- **Total: ~1 day.**

---

## V3, HTML composite ads

### What it is

A sibling to V1 that produces HTML/CSS ad creatives at ad-sized canvases (1080×1080, 1080×1350, 1080×1920), then screenshots them to PNG. Six niche templates baked in.

Use case V1 cannot serve: composed ads with headline + CTA + stats + hero image overlaid, in a specific brand layout. V1 produces photorealistic *photographs*. V3 produces *designed ads*.

### Backend module (`ad_creatives.rs`)

```rust
#[tauri::command]
async fn ad_creatives_generate(args: AdCreativeArgs) -> Result<AdCreativeResult>;
// Builds the prompt from niche template + form fields.
// Runs `claude -p` to produce an HTML/CSS artifact.
// Saves HTML to: media-buying/data/<client>/ad-creatives/<timestamp>-<slug>.html
// Screenshots to PNG at the requested dimensions (see screenshot module).
// Returns paths to both.

#[tauri::command]
async fn ad_creatives_list(client_slug: String) -> Result<Vec<AdCreativeEntry>>;
// Reads the ad-creatives folder, returns metadata for the gallery.

struct AdCreativeArgs {
    client_slug: String,
    niche: String,                   // "dentist" | "gym" | ...
    dimensions: AdDimensions,        // Square | Vertical45 | Story
    headline: Option<String>,        // override default
    offer: Option<String>,
    hero_image_path: Option<String>, // from V1 or V2 output
    reference_image_paths: Vec<String>, // for visual style matching
}
```

### Six niche templates (`app/src/lib/adTemplates.ts`)

| Niche | Format | Palette | Fonts | Hook |
|---|---|---|---|---|
| Dentist | 1080×1080 | Mint #E8F5E9 / Cream #FFF8E1 | Playfair Display + Inter | Before/after, "first visit shouldn't end in tears" |
| Gym (35-50yo dads) | 1080×1350 | Black #0A0A0A / Neon #00FF88 | Bebas Neue + Inter | Transformation, "dropped 22 lbs without giving up beer" |
| Italian Restaurant | 1080×1080 | Cream #F5E9D0 / Brown #3E2723 | Caveat + Cormorant | Hand-written secret menu, "locals only" |
| Real Estate | 1080×1350 | Navy #0F1B2D / Champagne #C9A961 | Cormorant Garamond + Manrope | Sold listing flex, "$47K over asking in 8 days" |
| Hair Salon | 1080×1920 | Pink #F8E8E8 / Rose gold #B76E79 | Didot/Bodoni + sans | Before/after, "brunette to blonde in 4 hours" |
| Plumber | 1080×1080 | Red #C8102E / White | Oswald + Inter | Trust, "We answer the phone. Apparently that's rare." |

Each template prompt includes: exact pixel dimensions, palette + fonts (Google Fonts CDN), layout description (before/after split, stats panel, urgency badge), placeholder slots for substituted fields, and the explicit instruction "inline all CSS, no JavaScript, no external assets except the hero image if provided and Google Fonts."

### Screenshot capture (`screenshot.rs`, cross-cutting decision)

HTML → PNG is needed here AND for LP previews. Three options:

| Option | Pros | Cons |
|---|---|---|
| Bundle Playwright via Tauri sidecar | Reliable, cross-platform | ~150MB extra; sidecar wiring effort |
| Use WebView2 (Windows) / WKWebView (Mac) capture API | No extra deps | Platform-specific code; lower fidelity |
| Punt to a CLI tool (`shot-scraper`, `wkhtmltoimage`) | Trivial to invoke | User must install separately |

**Recommendation:** Playwright sidecar. Also unlocks landing-page screenshots and any future "render this HTML to image" need.

Generic helper: `screenshot_html(html_path, width, height) -> png_path` in `app/src-tauri/src/screenshot.rs`. Called from `ad_creatives.rs`, `web_designer.rs`, and (later) `pitch_decks.rs`.

### Frontend page (`AdCreativesPage.tsx`)

**Top bar:** niche picker (six chips matching V2 palette).

**Left (form):**
- Dimensions toggle: Square / 4:5 / Story.
- Optional fields: headline override, offer/CTA override, urgency line ("5 spots left").
- Hero image picker: browses the client's `visuals/` or `Assets/` folder (drops in V1/V2 output).
- Reference image drop-zone: brand guidelines, competitor ads, screenshots. Attached to the Claude call for visual style matching.

**Right (preview):**
- Live HTML preview as the model streams.
- PNG screenshot tile once render completes.
- "Generate 9 more variations" button (combo workflow, see Meta Ads doc).
- "Open PNG" / "Reveal in Explorer" buttons.

### Reference-image attachment

`GenericFormGenerator` does not currently support image attachments. Small extension to `tauri.ts` and the `claude -p` invocation: `claude -p` supports image input via `--image <path>`. Add optional `referenceImages: string[]` field to the prompt-runner.

Unlocks visual reference matching across **all** generators (ads, pages, decks). Build once, properly.

### Acceptance criteria

- Pick "Plumber" niche → click Generate → HTML preview in 10-15s, PNG saved to client folder.
- Override headline → regenerate → new variation respects override.
- Drop a competitor's ad PNG into the reference zone → output matches its visual feel.
- Pick a V1/V2 image as the hero → it appears in the rendered ad.

### Effort

- Screenshot module + Playwright sidecar bundling: 1 day.
- `ad_creatives.rs` + six templates: 1 day.
- `AdCreativesPage.tsx` + gallery: 1 day.
- Reference-image attachment plumbing: half a day.
- **Total: ~3.5 days.**

---

## Verbatim prompts: niche recipe library

Stored in `app/src/lib/visualRecipes.ts` (V1/V2) and `app/src/lib/adTemplates.ts` (V3), keyed by niche id. `[CITY]` and `[NEIGHBORHOOD]` are substitutable placeholders.

### Dentist

**V1/V2 image (Nano Banana):**
```
Photorealistic warm modern dental office. Female dentist 30s, friendly smile, light-blue scrubs, gently examining a smiling 8-year-old girl in the dental chair. Soft natural light through windows. Mint accent wall, plants. Documentary style, Sony A7IV, 50mm, shallow DOF.
```

**V2 motion (Seedance):**
```
The dentist gently lifts the dental mirror, smiles, and turns to camera with a thumbs-up. Child laughs softly. Warm cinematic motion. 5 seconds.
```

**V3 composite (HTML):**
```
Create an HTML ad creative, 1080x1080, square social-feed format. Niche: family dentist in [CITY]. Format: before/after comparison. Headline: "Your kid's first dental visit shouldn't end in tears." Style: warm and trustworthy. Mint #E8F5E9, cream #FFF8E1, modern serif headline (Playfair Display), Inter body. Include: 5-star badge, "247 happy families this year", soft photo placeholders labeled "ANXIOUS BEFORE" / "SMILING AFTER". CTA: "Book your free consult →" Output: a single HTML file with inline CSS, ready to screenshot at 1080x1080.
```

### Local Gym

**V1/V2 image:**
```
Photorealistic gritty local gym at 6 AM. Man, 45, slightly overweight but determined, mid-deadlift, sweat on forehead, plain black t-shirt. Cinematic lighting, dust in air, RED, 35mm anamorphic.
```

**V2 motion:**
```
Man completes the deadlift, racks the barbell, exhales heavily, then looks straight to camera with a small confident nod. 5 seconds.
```

**V3 composite:**
```
Create an HTML ad creative, 1080x1350, vertical Reels/Stories format. Niche: local gym in [CITY], target dads 35-50. Format: transformation + offer. Headline: "How Mike dropped 22 lbs at 47, without giving up beer." Style: matte black #0A0A0A, neon green #00FF88, all-caps display (Bebas Neue), gritty industrial. Include: stats panel (-22 lbs / 16 weeks / 3x per week), pull-quote testimonial, "5 spots left, January cohort". CTA: "Claim your spot →" Output: single HTML, inline CSS, ready to screenshot at 1080x1350.
```

### Restaurant

**V1/V2 image:**
```
Photorealistic top-down shot of a wood-fired pizza being pulled from oven on a wooden peel, cheese still bubbling, smoke rising, basil leaves scattered. Dim warm restaurant lighting in background, blurred candles. Phase One, 80mm, food editorial.
```

**V2 motion:**
```
Camera slowly pushes in. Pizza is placed on the table, hand reaches in and takes a slice, cheese pull. 5 seconds.
```

**V3 composite:**
```
Create an HTML ad creative, 1080x1080. Niche: Italian family spot in [CITY]. Format: hand-written secret-menu special. Headline: "Wednesday's secret menu (locals only)" Style: warm chalkboard, cream #F5E9D0, brown #3E2723, Caveat handwritten headline, Cormorant for menu items. Include: 3 dishes + prices, "Walk-in only, 6 to 9 PM", italic line "(don't tell the tourists)". CTA: "See you Wednesday →" Output: single HTML, inline CSS, screenshot-ready.
```

### Real Estate

**V1/V2 image:**
```
Photorealistic exterior of a modern $850K family home, golden hour, manicured lawn, warm interior lights on, "JUST SOLD" sign in foreground with confident realtor (Latina, 35, blazer, smiling) standing next to it. Architectural photography, Sony A1, 24mm.
```

**V2 motion:**
```
Camera slowly tracks left, revealing the full house. Realtor turns to camera, smiles, mouths "sold". 5 seconds.
```

**V3 composite:**
```
Create an HTML ad creative, 1080x1350. Niche: realtor in [CITY], target home sellers. Format: sold-listing flex. Headline: "$47K over asking. In 8 days. In [NEIGHBORHOOD]." Style: editorial luxe, navy #0F1B2D, champagne #C9A961, Cormorant Garamond + Manrope. Include: before/after price tags, "8 days on market" badge, agent photo placeholder, 3-bullet "what we did differently". CTA: "Want yours sold like this? DM me 'PLAYBOOK'" Output: single HTML, screenshot at 1080x1350.
```

### Hair Salon

**V1/V2 image:**
```
Photorealistic salon mirror selfie POV. Beautiful 28-year-old woman with freshly dyed bombshell blonde hair, glossy finish, perfect waves, black robe, ecstatic smile, holding phone slightly up. Soft pink salon lighting, marble counter, hairdryer in BG. Shot on iPhone 16 Pro, ultra-realistic.
```

**V2 motion:**
```
Woman flips her hair side to side, laughs, then blows a kiss to camera. 5 seconds.
```

**V3 composite:**
```
Create an HTML ad creative, 1080x1920 Story format. Niche: hair colorist in [CITY], target women 25-45. Format: before/after one-frame. Headline: "Boring brunette → bombshell blonde in 4 hours." Style: editorial fashion mag, soft pink #F8E8E8, rose gold #B76E79, Didot or Bodoni headline, clean sans body. Include: two photo boxes labeled "9 AM" / "1 PM", price callout "$280 (worth $450)", booking urgency. CTA: "DM 'GLOW' to book this week →" Output: single HTML, screenshot at 1080x1920.
```

### Plumber

**V1/V2 image:**
```
Photorealistic plumber, 40, friendly face, branded company polo shirt, kneeling in clean modern kitchen fixing a sink. Toolbox visible, smiling homeowner (woman, 35) in background holding coffee. Natural daylight from window. Documentary style.
```

**V2 motion:**
```
Plumber finishes tightening, stands up, gives thumbs-up to homeowner. She laughs and nods. 5 seconds.
```

**V3 composite:**
```
Create an HTML ad creative, 1080x1080. Niche: local plumber in [CITY]. Format: trust-builder. Headline: "We answer the phone. (Apparently that's rare now.)" Style: blue-collar honest, red #C8102E, white, heavy condensed sans (Oswald) headline, Inter body. Include: 3 stats (24/7 / $0 quote / 4.9★ on 312 reviews), phone number HUGE, "No surprises, no hidden fees" badge. CTA: "Call now, we're 11 min away" Output: single HTML, screenshot at 1080x1080.
```

---

## Bonus: landing-page prompts for the existing WebDesigner

The class also included three full landing-page prompts. They belong as new niche presets in `WebDesignerPage.tsx`, not in this ad-creative doc. Migrating them is part of "next time those niche presets are touched."

### Dentist landing page
```
Build a complete one-page conversion site for a family dentist in [CITY]. Sections: 1) Hero "The dentist your kids actually ask to visit" + CTA "Book a free first visit" + trust strip. 2) The 3 promises (no shaming about flossing / no surprise bills / no scary kids' visits). 3) 3 testimonial cards. 4) Meet Dr. [LAST NAME] + photo + 4-paragraph bio focused on family + community. 5) Services grid, 6 cards. 6) FAQ, 7 questions, accordion via details/summary. 7) Final CTA + map + phone + booking form. Visual: warm trust theme. Mint #5DD3B3, cream #FFF8E1, Playfair Display + Inter. Mobile-first. Output: single HTML file, inline CSS, complete with realistic placeholder copy, no JS.
```

### Gym landing page
```
Build a one-page sales site for a local gym in [CITY] selling a 12-week transformation program for dads 35-50. Sections: 1) Hero "Lose the dad bod in 12 weeks. Without giving up your life." + video placeholder + CTA. 2) Who this is for / not for, two-column. 3) Transformation, 3 before/after card placeholders with stats. 4) The 12-week system, 4 phases on a horizontal timeline. 5) What's included, 6 deliverables with checkmarks. 6) Investment + 30-day money-back guarantee. 7) Coach bio + facility photos. 8) FAQ, 8 questions, accordion. 9) Final CTA, application form, "5 spots left" urgency. Visual: matte black #0A0A0A, neon green #00FF88, Bebas Neue + Inter. Mobile-first. Output: single HTML file, inline CSS.
```

### Real estate landing page
```
Build a one-page lead-magnet site for a realtor in [CITY] targeting home sellers. Lead magnet: free home valuation report. Sections: 1) Hero "Find out what your [CITY] home is worth in 2026, free, in 24 hours" + form (address + email + phone) + trust strip. 2) How the report works, 3 steps. 3) Recent sold listings, grid of 6. 4) Why list with [AGENT], 5 differentiators + agent photo. 5) Testimonials, 3 cards. 6) FAQ, 6 questions. 7) Final CTA, same form repeated. Visual: editorial luxe, navy #0F1B2D, champagne #C9A961, Cormorant Garamond + Manrope. Mobile-first. Output: single HTML file, inline CSS.
```
