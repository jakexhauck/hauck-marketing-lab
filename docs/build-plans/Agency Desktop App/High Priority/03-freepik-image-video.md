# 2. Freepik — Image (Nano Banana) + Video (Seedance)

## What it is
A single Freepik subscription provides:
- **Nano Banana** (Google Gemini 2.5 Flash) — photorealistic still image generation/editing.
- **Seedance** (ByteDance) — image-to-video animation, natural motion, 5-second clips, optional
  lip-sync.

Replaces Midjourney + Runway with one API.

## Why we want it
The app currently has zero visual asset generation. We can write copy (Ad Copy form), build pages
(`WebDesignerPage`), and analyze data — but we can't produce the actual *image* that goes into the
ad. This is the missing link in the local-biz agency stack.

## Architecture fit
Freepik exposes a REST API. We add:
- A new Rust module `app/src-tauri/src/visuals.rs` for the HTTP calls.
- API key storage via the existing SOPS layer (see `app/src-tauri/src/sops.rs`).
- A new React page `VisualsPage.tsx` modelled on `WebDesignerPage.tsx`.
- A new sidebar workflow entry `"visuals"` (extend `WorkflowView` in `Sidebar.tsx`).

## Implementation plan

### Step 1 — Credentials
Add `freepik_api_key` to the SOPS-managed credentials. Wire it through `credentials.rs` so
`visuals.rs` can read it without re-implementing decryption.

### Step 2 — Backend module (`visuals.rs`)
Three Tauri commands:

```rust
#[tauri::command]
async fn visuals_generate_image(prompt: String, niche: String, client_slug: String) -> Result<String>;
// POST to Freepik /v1/ai/text-to-image (Nano Banana model).
// Polls status until done. Saves PNG to:
//   media-buying/data/<client>/visuals/<timestamp>-<slug>.png
// Returns the absolute path.

#[tauri::command]
async fn visuals_animate_image(image_path: String, motion_prompt: String, client_slug: String) -> Result<String>;
// POST to Freepik /v1/ai/image-to-video (Seedance model) with the image.
// Polls until rendered. Saves MP4 next to the source PNG.
// Returns the absolute path.

#[tauri::command]
async fn visuals_list_outputs(client_slug: String) -> Result<Vec<VisualEntry>>;
// Reads media-buying/data/<client>/visuals/, returns metadata for gallery view.
```

Polling is required — Freepik renders take 5–30 seconds. Use the existing event-emission pattern
(`events.rs`) to stream `visuals-status` events back to the UI for a live progress indicator.

### Step 3 — Frontend page (`VisualsPage.tsx`)
Two-column layout, mirrors `WebDesignerPage`:

**Left column (controls):**
- Niche picker (reuse the `NICHES` array from `WebDesignerPage` — same niches, same colors).
- Mode toggle: `Still` / `Still + Animate`.
- Prompt textarea with niche-specific defaults (see Step 4 below).
- Aspect ratio: 1:1 / 9:16 / 4:5.
- "Generate" button.

**Right column (output):**
- Live preview of the generated image as it streams in.
- If `Still + Animate` is selected, an "Animate this" button appears below the image with a second
  textarea for the motion prompt — defaults to a niche-appropriate motion (see Step 4).
- A gallery strip at the bottom showing previously generated assets for this client.

### Step 4 — Niche recipe library
Hardcode the six niche recipes from the class as defaults. Each is a pair:

| Niche | Image prompt default | Animation prompt default |
|---|---|---|
| Dentist | Warm modern dental office, female dentist (30s, blue scrubs) examining smiling 8yo. Sony A7IV, 50mm, documentary. | Dentist lifts mirror, smiles, thumbs-up. Child laughs. 5s. |
| Gym | Gritty gym 6 AM, man 45, mid-deadlift, sweat. RED 35mm anamorphic. | Completes deadlift, racks bar, exhales, confident nod. 5s. |
| Restaurant | Top-down wood-fired pizza pulled from oven, cheese bubbling, smoke. Phase One 80mm food editorial. | Camera pushes in. Pizza placed on table. Hand takes slice with cheese pull. 5s. |
| Real Estate | Modern $850K home exterior golden hour, "JUST SOLD" sign, Latina realtor 35. Sony A1 24mm. | Camera tracks left, realtor turns, mouths "sold". 5s. |
| Hair Salon | Salon mirror selfie POV, woman 28, freshly dyed bombshell blonde. iPhone 16 Pro. | Flips hair side to side, laughs, blows kiss. 5s. |
| Plumber | Plumber 40, branded polo, kneeling in modern kitchen fixing sink, homeowner with coffee. | Finishes tightening, stands, thumbs-up. Homeowner laughs and nods. 5s. |

Store these in a new file `app/src/lib/visualRecipes.ts` so they're editable without touching the
page component.

### Step 5 — Hand-off into ad creatives (later)
Once plan #3 (Static Ad Creative Generator) is built, add a "Use in ad" button on each generated
image that drops it into the creative form as the hero asset.

## What's out of scope for v1
- **Upscaling / face refinement.** Freepik has these endpoints; skip until base flow is solid.
- **Bulk generation** (10 variations at once). Single image at a time for v1; bulk is a follow-up.
- **Lip-sync.** Seedance supports it, but it needs an audio track input — separate feature.

## Risks / things to watch
- **Cost per render.** Nano Banana is roughly $0.04/image, Seedance ~$0.10/sec of video. Make sure
  the UI shows a cost estimate before each generation so Jake doesn't burn $20 by accident.
- **NSFW / IP filters.** Freepik rejects certain prompts. Surface the rejection message clearly
  rather than failing silently.
- **Long polls.** A 30-second wait with no feedback feels broken. The progress event stream is not
  optional — build it in from day one.

## Acceptance criteria
- Pick a niche, click Generate, see a photorealistic still in <30s saved to the client's folder.
- Click "Animate this", see a 5s MP4 saved next to it.
- The gallery on the right shows all prior assets for the selected client.
- Cost-per-render is visible before submitting.

## Effort estimate
- SOPS credential wiring: 2 hours.
- `visuals.rs` (two endpoints + polling + event stream): 1 day.
- `VisualsPage.tsx` + recipe library: 1 day.
- Cost estimation + error surfacing: half a day.
- **Total: ~2.5 days.**

---

## Verbatim prompts — niche recipe library

Each niche is a pair: a Nano Banana **image** prompt and a Seedance **animation** prompt. Store
in `app/src/lib/visualRecipes.ts` keyed by niche id; the page wires them as the default prompt
text when the niche chip is clicked.

### Dentist
**Image (Nano Banana):**
```
Photorealistic warm modern dental office. Female dentist 30s, friendly smile, light-blue scrubs, gently examining a smiling 8-year-old girl in the dental chair. Soft natural light through windows. Mint accent wall, plants. Documentary style, Sony A7IV, 50mm, shallow DOF.
```
**Animation (Seedance):**
```
The dentist gently lifts the dental mirror, smiles, and turns to camera with a thumbs-up. Child laughs softly. Warm cinematic motion. 5 seconds.
```

### Local Gym
**Image (Nano Banana):**
```
Photorealistic gritty local gym at 6 AM. Man, 45, slightly overweight but determined, mid-deadlift, sweat on forehead, plain black t-shirt. Cinematic lighting, dust in air, RED, 35mm anamorphic.
```
**Animation (Seedance):**
```
Man completes the deadlift, racks the barbell, exhales heavily, then looks straight to camera with a small confident nod. 5 seconds.
```

### Restaurant
**Image (Nano Banana):**
```
Photorealistic top-down shot of a wood-fired pizza being pulled from oven on a wooden peel, cheese still bubbling, smoke rising, basil leaves scattered. Dim warm restaurant lighting in background, blurred candles. Phase One, 80mm, food editorial.
```
**Animation (Seedance):**
```
Camera slowly pushes in. Pizza is placed on the table, hand reaches in and takes a slice — cheese pull. 5 seconds.
```

### Real Estate
**Image (Nano Banana):**
```
Photorealistic exterior of a modern $850K family home, golden hour, manicured lawn, warm interior lights on, "JUST SOLD" sign in foreground with confident realtor (Latina, 35, blazer, smiling) standing next to it. Architectural photography, Sony A1, 24mm.
```
**Animation (Seedance):**
```
Camera slowly tracks left, revealing the full house. Realtor turns to camera, smiles, mouths "sold". 5 seconds.
```

### Hair Salon
**Image (Nano Banana):**
```
Photorealistic salon mirror selfie POV. Beautiful 28-year-old woman with freshly dyed bombshell blonde hair, glossy finish, perfect waves, black robe, ecstatic smile, holding phone slightly up. Soft pink salon lighting, marble counter, hairdryer in BG. Shot on iPhone 16 Pro, ultra-realistic.
```
**Animation (Seedance):**
```
Woman flips her hair side to side, laughs, then blows a kiss to camera. 5 seconds.
```

### Plumber
**Image (Nano Banana):**
```
Photorealistic plumber, 40, friendly face, branded company polo shirt, kneeling in clean modern kitchen fixing a sink. Toolbox visible, smiling homeowner (woman, 35) in background holding coffee. Natural daylight from window. Documentary style.
```
**Animation (Seedance):**
```
Plumber finishes tightening, stands up, gives thumbs-up to homeowner. She laughs and nods. 5 seconds.
```
