# Static Ad Creative Builder — Activation Runbook

> Status: **built, awaiting first live call.** Code is wired end-to-end, typecheck + cargo check both clean. The form will not render images until you complete the steps below.
>
> Delete this doc once you have run one successful generation.

## What got built

A new media-buying form (`ad-creative`) that:

1. Pulls the 12 ad-copy variations from the prior sequence step.
2. Lets you tick which ads to render at which dimensions (1:1, 9:16, 4:5, 16:9).
3. Asks Claude to draft a Nano Banana 2 prompt per (ad × dimension) pair, emitted as JSON.
4. Calls Google AI Studio (`gemini-3-pro-image-preview`) for each prompt.
5. Saves the PNGs into `vault/Clients/<name>/Assets/<YYYY-MM-DD>-creatives/`.
6. Appends an `## Image generation` footer to the saved brief listing every saved path and any per-prompt failure.

The form sits between `Generate ad copy` and `Send for approval` in the media buying sequence.

## Files touched

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
| `app/src/components/GenericFormGenerator.tsx` | `runImageGeneration` post-processor — kicks in when a form sets `imageGeneration.provider = "nano-banana-2"`. |

## Activation steps

### 1. Get a Google AI Studio API key

1. Open `https://aistudio.google.com/apikey`.
2. Sign in with the Google account you want billed.
3. Click **Create API key** and copy the value.
4. Make sure the project has the **Generative Language API** enabled (AI Studio prompts for this on first key creation).

### 2. Paste the key into the app

1. Restart the Tauri dev server: `pnpm tauri dev` from `app/`. (Required: the Rust backend changed, so the dev binary needs a rebuild.)
2. Open **Settings** in the app.
3. Scroll to the **Google AI Studio** panel.
4. Paste the key. Click **Save key**. The panel will switch to a masked display.

The key writes to `config.json` under `gemini_api_key`. Never commit `config.json`.

### 3. Smoke test (one ad, one dimension)

1. Pick a client where the **Generate ad copy** step is already done.
2. Open the media buying sequence and click into the new **Build static creatives** step.
3. The prior ad-copy markdown auto-fills the reference field.
4. Under **Pick ads per dimension**, tick exactly **Ad 1** under Square (1:1).
5. Leave the rest of the form on defaults.
6. Click **Build creative prompts**.

What you should see:

- Claude streams the JSON block, then the markdown summary.
- The footer is augmented with `## Image generation` listing one saved PNG path.
- A `vault/Clients/<name>/Assets/<today>-creatives/ad-1-1x1.png` file exists.

If that works, run the full set: tick whatever combinations you actually want.

## If the first generation fails

The Gemini API shape was written from documentation, not verified against a live call. If you see one of these errors in the saved brief footer, ping me with the exact error string:

| Error | Likely cause | Fix location |
|---|---|---|
| `gemini 404` | Wrong model ID slug. Probably needs to be `gemini-2.5-flash-image` or a different preview suffix. | `app/src-tauri/src/gemini_image.rs:13` (the `MODEL_ID` constant) |
| `gemini 400` | Wrong request key shape (e.g. `aspectRatio` lives somewhere else in the body). | `app/src-tauri/src/gemini_image.rs:53-58` (the `generationConfig` block) |
| `gemini response missing inlineData.data` | Response shape differs. | `app/src-tauri/src/gemini_image.rs:81` (the `value.pointer(...)` path) |
| `gemini 403 / PERMISSION_DENIED` | API key is valid but Generative Language API is not enabled on the project. | Google AI Studio dashboard. |
| `gemini 429` | Per-minute rate limit. | Lower the batch size or wait a minute. |

Every fix is a single-line change in `gemini_image.rs`. The frontend does not need to change.

## What's intentionally NOT built yet

1. **Automatic Google Drive upload.** The Drive folder ID is captured per-client (sticky on `onboarding.json` under `sequence.driveFolderId`) and printed in the saved brief footer, but the actual upload step is manual. Wiring `drive_upload.rs` to sync the assets folder is the next task.
2. **Parallel image generation.** Calls are serial: one PNG at a time. Eight prompts takes one to two minutes. Parallelising is straightforward when latency becomes a pain point.
3. **Real ad-headline labels in the picker.** The 12 ad slots show as `Ad 1`...`Ad 12`. You read the chained ad-copy markdown to know which slot is which framework. A v2 could parse the markdown and label the checkboxes with framework + word count.

## Where the state lives

- API key: `config.json` (per-user, gitignored).
- Per-client Drive folder ID: `vault/Clients/<name>/onboarding.json` under `sequence.driveFolderId`.
- Rendered PNGs: `vault/Clients/<name>/Assets/<YYYY-MM-DD>-creatives/`.
- Saved brief markdown: wherever `saveGeneratorOutput` writes briefs for that client (the standard generator output folder).

## Delete this doc when

You have run one full creative set successfully, the PNGs landed in the vault, and you have confirmed Jake's voice / brand show up in the renders. At that point the runbook has served its purpose; memory + git history are the lasting record.
