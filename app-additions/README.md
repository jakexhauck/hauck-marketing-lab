# App Additions — Index

Four planned additions to the Hauck Marketing Lab app, drawn from the AI Advertiser bonus class
(`bonus-claude-freepik-local-biz`). Each plan is self-contained and assumes the existing app
architecture: Tauri shell, React frontend, `claude -p` for AI, folder = source of truth, vault for
client memory, forms-driven UX.

Ordered by impact-to-effort ratio (biggest unlock first).

## 1. [Meta Ads MCP](01-meta-ads-mcp.md)
Wire the official Meta Ads MCP server into Claude so the app pulls **live campaign data** — spend,
CPM, CTR, CPA, ROAS, anomalies — without CSV exports. Replaces the static `data-analyst` skill's
input layer and unlocks: daily pulse, Friday client report, cleanup audit, pre-pitch audit, live
Bloomberg-style dashboard.

**Effort:** Low (config + a few prompt templates).
**Where it lives:** New "Reports" forms in `formConfigs.ts`, new sidebar entry under media-buying.

## 2. [Freepik (Nano Banana + Seedance)](02-freepik-image-video.md)
Add a **Visuals** workflow that calls Freepik's API to generate photorealistic stills (Nano Banana,
Gemini 2.5 Flash) and animate them into 5-second clips (Seedance). Closes the only real gap in the
agency stack — you can already write copy and build pages, but not produce the image *in* the ad.

**Effort:** Medium (new Rust module for Freepik API, new page, credential storage).
**Where it lives:** New `WorkflowView = "visuals"`, new `visuals.rs` backend module.

## 3. [Static Ad Creative Generator](03-static-ad-creatives.md)
A sibling to `WebDesignerPage` that outputs **1080×1080 / 1080×1350 / 1080×1920 HTML/CSS ads**,
screenshot-ready to PNG. Six niche templates baked in (dentist, gym, restaurant, real estate,
salon, plumber).

**Effort:** Low-medium (largely a clone of the web-designer module with different prompts + output
dimensions + a headless-browser screenshot step).
**Where it lives:** New `WorkflowView = "ad-creatives"`, new `ad_creatives.rs` backend module.

## 4. [Pitch Deck Generator](04-pitch-decks.md)
A single-prompt generator that produces a **12-slide HTML pitch deck** (snap-scroll, fullscreen
sections, glassmorphism cards) for client proposals. Lowest priority — useful at the sales stage,
not in delivery.

**Effort:** Low (single form, single prompt, reuses Claude Design pattern).
**Where it lives:** New `phase: 1` form in `formConfigs.ts` (slots into "Close the Deal").

---

## Cross-cutting concerns
A few things will need attention regardless of which add-on lands first:

- **Credential storage.** Meta Ads MCP uses OAuth (handled by Claude). Freepik needs an API key —
  store via SOPS (already wired) under `freepik_api_key`.
- **Screenshot capture.** Both #2 and #3 want HTML → PNG. Decide once: either bundle Playwright in
  the Tauri sidecar, use a WebView2 screenshot, or punt to a CLI tool. See note in
  `03-static-ad-creatives.md`.
- **Reference image input.** The class hammers on "drop reference images into Claude when you
  prompt." Make sure any new form supports image attachments — `GenericFormGenerator` doesn't yet,
  so this is a small extension that benefits all four.
- **Output destination.** Stick to the established pattern: write to
  `media-buying/data/<client>/<deliverable-type>/<timestamp>-<title>.md` (or `.html` / `.png`).
