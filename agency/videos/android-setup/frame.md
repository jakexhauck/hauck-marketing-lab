# frame.md - App setup tutorial

## Palette (by role)

| Role | Hex | Source |
| --- | --- | --- |
| Canvas (video background) | `#0A1D19` | Hauck brand, home-screen icon background (`capture/assets/icon-apple-touch-icon-180x180.png`) |
| Canvas raised | `#10302A` | tint of canvas toward the green |
| Accent (tap rings, chapter rail, highlights) | `#4DBB83` | Hauck brand green, icon "H" stroke |
| Text on canvas | `#EAF5EF` | green-tinted off-white |
| Muted text on canvas | `#8FB3A4` | |
| App UI accent (inside screens only) | `#4F46E5` | live login page (`capture/extracted/tokens.json`) |
| App UI panel bg | `#F6F7FB` / `#FFFFFF` | live login page |
| App UI text | `#14161F` / `#555A6B` | live login page |

Rule: green belongs to the video, indigo belongs to the app. Indigo never appears outside a device screen.

## Type

- Display: Poppins 600/700 (live app headings + Hauck brand)
- Body/UI: Inter 400/500/600 (live app body)
- Captions: Inter 600, 40px, on a canvas-raised pill, bottom band
- Fonts embedded from `capture/assets/fonts/` (woff2), no network at render.

## Shapes and motion

- Device frames: laptop (16:10 screen), phones with 52px radius, 3px `#2A4A42` bezel.
- Tap indicator: green ring, scale 0.6 to 1.4, opacity 0.9 to 0, 0.45s, power2.out.
- Cursor (PC only): white arrow with dark outline.
- Eases: power3.out for entrances, power2.inOut for camera moves, back.out(1.6) for pops.

## Bans

- No em dashes anywhere.
- No helper text in app mockups beyond what the real screens show.
- No glow-heavy neon, no gradient text, no purple outside device screens.
- No slideshow (fresh card each beat) and no screensaver motion.
- Captions keep-out: on-screen content stays in the top ~83%.
