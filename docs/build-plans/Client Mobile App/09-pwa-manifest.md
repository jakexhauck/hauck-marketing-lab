# Section 09: PWA Manifest + Install

## Goal

Make the web app installable as a PWA. "Add to Home Screen" on iOS or Android produces a real app icon, opens in standalone mode (no browser chrome), and looks indistinguishable from a native app. This is the section that earns the "mobile app" framing.

## Depends on

Section 01 (project scaffold). Can technically run anytime after 01, but visually it's most rewarding after Section 08 when the rest of the app looks complete.

## Acceptance criteria

- `manifest.webmanifest` (or `manifest.json`) exists in `public/` with:
  - `name`: "Hauck Dashboard"
  - `short_name`: "Hauck"
  - `start_url`: "/"
  - `display`: "standalone"
  - `background_color`: dark slate or near-white (matches app shell)
  - `theme_color`: brand-neutral default (slate-900)
  - `icons`: 192×192, 512×512 PNG + a maskable variant
- `<link rel="manifest">` and required Apple meta tags in `index.html`:
  - `<meta name="apple-mobile-web-app-capable" content="yes">`
  - `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
  - `<link rel="apple-touch-icon">` 180×180
- A minimal service worker registered (via `vite-plugin-pwa` or a hand-rolled 20-line one) that caches the app shell so the site loads instantly on repeat visits, even offline
- Testable on real iPhone: open the deployed URL in Safari → Share → Add to Home Screen → icon appears → tap it → app opens in fullscreen, no Safari chrome
- Same on Android: Chrome shows an install prompt or the user can tap "Install app" from the menu
- The first-load experience does not feel slow (no big assets blocking render)
- `pnpm build` includes the manifest, icons, and service worker in `dist/`
- `pnpm typecheck` passes

## Files created / modified

```
client-dashboard/
  public/
    manifest.webmanifest
    icon-192.png
    icon-512.png
    icon-maskable.png
    apple-touch-icon.png   (180×180)
  index.html                (modified, meta tags + manifest link)
  vite.config.ts            (modified, add vite-plugin-pwa)
  src/
    pwa.ts                  (service worker registration, ~10 lines)
  src/main.tsx              (modified, import pwa registration)
```

## Steps

1. Generate icon assets. Simplest path: use a 512×512 PNG with the Hauck mark on a neutral background, downscale to 192. For the maskable variant, leave 20% safe-zone padding. If no real logo yet, use a clean monogram ("H" in sans-serif, white on slate-900, rounded square background).
2. Write `manifest.webmanifest`. Validate at [web.dev/manifest](https://web.dev/manifest) or with `pwabuilder.com`.
3. Add `vite-plugin-pwa` (`pnpm add -D vite-plugin-pwa`) and configure it minimally, `registerType: 'autoUpdate'`, `injectRegister: 'auto'`. Or skip the plugin and hand-roll a tiny service worker if Jake prefers fewer dependencies.
4. Update `index.html` with the manifest link and Apple meta tags.
5. Add the service worker registration in `src/main.tsx` (or `pwa.ts` if using vite-plugin-pwa).
6. Run `pnpm build && pnpm preview` and test the install flow on a real phone (use your local network IP or ngrok). Confirm icon, standalone launch, offline reload works.

## Stop condition

Commit when the production build produces a valid manifest, the app installs on iOS and Android with the right icon, and launching from the home screen opens it standalone.

**Commit message:** `client-dashboard: PWA manifest, icons, and service worker for home-screen install (section 09)`

## Token weight

Light. Configuration + a few small files. The icon generation is the only real time sink, and that's mostly outside Claude's scope (use Figma, Squoosh, or an online generator).

## Notes

- iOS Safari is the strictest PWA target. If it installs correctly there, Android will be fine. Test on iOS first.
- Don't over-engineer the service worker. Phase 1 just needs offline shell caching so it feels instant on repeat opens. Phase 2 will add proper data-cache strategies for the GHL API responses.
- The `theme_color` defines the iOS status bar tint and Android task switcher color. Pick a neutral one (slate-900) so it works for all brand variants. Per-brand theme color would require manifest swapping per client, not worth the complexity in Phase 1.
- Manifest validation matters, a malformed manifest silently disables installability. Use Chrome DevTools → Application → Manifest to verify.
- The "Hauck" branding here is intentional. The white-label per-client app naming is a Phase 2 thing requiring per-client subdomains or manifest swapping. In Phase 1 the installed app is your agency's product, with the per-client brand inside.
