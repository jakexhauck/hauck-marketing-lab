# Google Reviews section — mockup brief (shared)

Each variant is ONE self-contained `.html` file (all CSS inline in a `<style>`
tag, no external requests except Google Fonts + an icon font/inline SVG). It must
render the **whole Google Reviews section**: the app shell chrome plus all FIVE
sub-pages, switchable with in-page tabs (vanilla JS show/hide). No build step,
opens straight in a browser.

This is the **client-facing** app ("Console" look, Modern Motion brand). The
mockup must look like it belongs inside the existing product, not a generic
template. Light theme is the default; a working light/dark toggle is a plus but
not required.

## The five sub-pages (render each as a switchable view)

1. **Overview** — the glance. KPI row (Average rating, Total reviews, New this
   month, Requests sent). A "Ready to ask" panel (recent completed jobs with a
   one-tap Ask button) and a "Recent reviews" panel (latest reviews: stars, name,
   snippet). A primary "Ask for a review" action.
2. **Ask for Reviews** — list of completed jobs: customer name, phone/email, when
   the job completed, and a "Start Campaign" button per row that flips to a
   "Campaign started" pill once pressed. This page already exists in the product;
   keep its behavior, just restyle to the variant.
3. **All Reviews** — every Google review. Filter chips (All / 5★ / 4★ / 1-3★ /
   Needs reply). Each review: stars, reviewer name, date, body, and a Reply
   action that reveals an AI-drafted reply the client can edit and post.
4. **Showcase** — pick a 5★ review and turn it into a social post or an
   embeddable website widget. Show a couple of "post preview" and "widget
   preview" cards.
5. **What's working** — simple analytics: rating trend over time (a small line or
   bar chart drawn in CSS/SVG), ask-to-review conversion, reply rate, best source.

## Sample content (use realistic local-service-business data)

Local home-services client (plumbing/HVAC). Average rating 4.8, 132 total
reviews, 6 new this month, 11 requests sent. Reviewer names like "The Garcias",
"Mark T.", "Janet R.". Review bodies about same-day hot water, AC tune-ups, a
burst-pipe save. Completed jobs: "Thompson water heater", "Reyes AC tune-up".
Do NOT invent fake growth percentages that imply proven results; keep numbers
plausible and modest.

## Brand + tokens (paste into your `<style>`, these are the real app tokens)

Fonts: Poppins (display, headings, big numbers) + Inter (body). Mono for figures:
JetBrains Mono.

```css
:root{
  --brand:#4f46e5; --brand-2:#7c73f0; --brand-dark:#4338ca; --brand-fg:#fff;
  --brand-text:#4f46e5; --brand-tint:rgba(79,70,229,.10); --brand-soft:#eceaff;
  --grad-brand:linear-gradient(135deg,#4f46e5 0%,#7c73f0 100%);
  --bg:#f6f7fb; --surface:#fff; --surface-2:#f1f3f9; --surface-3:#e9ebf3; --rail:#fbfcfe;
  --text:#14161f; --muted:#555a6b; --faint:#8a90a3;
  --border:#e7e9f1; --border-strong:#d4d8e6; --divider:#f1f3f9;
  --star:#f5a524; /* review stars (gold) */
  --positive:#16a34a; --positive-tint:rgba(22,163,74,.12);
  --warning:#d97706; --warning-tint:rgba(217,119,6,.14);
  --danger:#dc2626;
  --shadow-sm:0 1px 2px rgba(20,22,31,.04),0 1px 3px rgba(20,22,31,.05);
  --shadow-md:0 6px 18px rgba(40,42,70,.07),0 2px 6px rgba(40,42,70,.05);
  --shadow-lg:0 18px 40px rgba(40,42,70,.12),0 6px 14px rgba(40,42,70,.07);
  --ease-out:cubic-bezier(.23,1,.32,1);
  --radius-sm:8px; --radius:10px; --radius-lg:14px; --radius-xl:20px;
}
body{
  font-family:Inter,system-ui,sans-serif; color:var(--text); background:var(--bg);
  background-image:
    radial-gradient(60rem 40rem at 12% -8%,rgba(124,115,240,.16),transparent 60%),
    radial-gradient(50rem 38rem at 100% 0%,rgba(79,70,229,.12),transparent 55%),
    radial-gradient(46rem 36rem at 50% 120%,rgba(99,102,241,.10),transparent 60%);
  background-attachment:fixed;
}
```

Design language notes (match the product):
- Cards = "Panel": white surface, `1px solid var(--border)`, `--radius-lg`,
  `--shadow-sm`. Section headers inside panels are small/medium weight with a
  faint divider under them.
- Brand fills (primary buttons, active nav, the brand mark) use `--grad-brand`
  with white text. Small brand-colored TEXT uses `--brand-text` (indigo).
- Big numbers/headlines: Poppins, heavy weight, tight letter-spacing
  (`-0.035em` to `-0.055em`), tabular figures.
- Stars are gold `--star`; never use gold for anything but ratings/money.
- Uppercase mini-labels: 10.5px, 600, letter-spacing .08em, color --muted.
- Calm motion only: short ease-out fades/rises, hover lift -2px, nothing bouncy.

## App shell chrome (show it, lightly)

Left sidebar with the four sections (Home, Marketing, Sales, Customers,
Operations). Marketing is open and shows the **Google Reviews** parent EXPANDED
with its five children (Overview, Ask for Reviews, All Reviews, Showcase, What's
working) — the active child is highlighted with a brand-tinted pill and the group
has a left hairline border under the parent. A slim top bar with the page title.
The five children are the in-page tabs that swap the main view. (You can make the
sidebar children and the tabs the same control.)

## Deliverable

One file at the path you are told. Title each variant clearly in a top corner
("Variant A — <name>"). Make it feel real and shippable, not wireframe-grey.
No em dashes anywhere in visible text.
