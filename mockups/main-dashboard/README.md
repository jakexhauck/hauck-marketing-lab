# Main Dashboard — Mockups

Pixel-locked design for the **home screen of Hauck Marketing OS** — the
top-level surface that replaces the current Media Buying landing screen.

Earlier exploration rounds (01-06) have been removed; the only artifact that
survives is the v1 that's actually being built.

| File | Purpose |
|---|---|
| `07-dashboard-v1.html` | Source of truth for the v1 layout. Open in a browser to verify pixel fidelity during the React port. |
| `07-dashboard-v1.png`  | 1440×900 render of the HTML — the visual reference. |

Implementation contract lives in `Main Dashboard Plan.md` at the repo root.

## Design rules

Tokens are reused from `app/src/index.css`:

- Dark void `#08090d` with subtle grid + dual radial gradients.
- Copper accent `#ec9849`. Signal go/hold/stop.
- Hanken Grotesk (sans) · JetBrains Mono (eyebrows/metrics) ·
  Newsreader (display — **upright only, never italic**).
- 42px sticky top bar reading `HAUCK MARKETING OS`.
- `▸` arrow prefix on action labels.

## Re-render the PNG

If you edit `07-dashboard-v1.html`, refresh the PNG at the same dimensions:

```
msedge --headless=new --disable-gpu --hide-scrollbars \
       --window-size=1440,900 --virtual-time-budget=4000 \
       --screenshot=mockups/main-dashboard/07-dashboard-v1.png \
       file:///.../mockups/main-dashboard/07-dashboard-v1.html
```
