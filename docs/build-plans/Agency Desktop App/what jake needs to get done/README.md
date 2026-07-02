# What Jake needs to get done

Action items that require Jake (config, credentials, dashboard clicks) and cannot be self-served by the builder.

## Client Modern Motion rebrand (shipped + live 2026-06-26)

- [ ] **Set Willis's tenant brand color to indigo.** The Modern Motion rebrand is live, but the in-app brand HUE is read at runtime from Willis's Supabase tenant row (`brandColor`), not from CSS. The login screen and all structure (glass, gradient, motion, mono, dark mode) are already indigo, but once Willis's team signs in, the solid brand accent will be whatever their tenant row says. If it is not indigo, the solid brand and the fixed indigo-to-violet gradient can mismatch.
  - Fix: in the admin console, open Willis's client detail and set **Brand color** to `#4f46e5` (or clear it to fall back to the indigo default).

## Tier-1 client wiring (shipped + live 2026-07-02, `88ae0a6`)

Revenue, Home feed, and Reactivation now read real data. Two related surfaces stayed blocked on you:

- [ ] **Reviews content (stars / text / trends).** GHL's reputation API works, but Willis's Private Integration Token lacks the scope. Verified: `GET /reputation/reviews` returns 401 "not authorized for this scope."
  - Fix: GHL -> Settings -> Private Integrations -> open Willis's token -> add the **reputation / reviews** scope -> save. Tell me when done and I wire Reviews Overview / Insights / All.
- [ ] **Paid Ads Overview / Insights / Creatives (Meta data).** The Meta integration currently lives only in the Tauri desktop app (hardcoded token). To wire it into the client web app I need two things:
  - Set a Meta System-User token as a Cloudflare secret. I will hand you the exact `node scripts/cf.mjs env:set META_SYSTEM_USER_TOKEN ...` line to run with `!` (I'm blocked from writing CF secrets).
  - I add a `meta_ad_account_id` column to the tenants table (sourced from `media-buying/data/clients.yaml`, e.g. Willis `act_27110669075184924`). No action from you there beyond a go-ahead.
- [ ] **Smoke-test the newly-live surfaces** (I can't; every `/api/*` is login-gated). In a real Willis session, open **Revenue** (trend / YTD / top customers should show real numbers), **Home** (jobs-today + reviews-to-request cards), and **Marketing -> Campaigns -> Reactivation** (real pipeline counts). Flag anything that reads empty or wrong.

## Google Reviews funnel wired to the pipeline (shipped + live 2026-07-02)

The Reviews **Overview** tab now renders a live request -> click -> review funnel from the GHL review pipeline (stages you confirmed: Asked for review / Review link clicked / Positive review submission / Negative feedback received). Demo layout and the other tabs are unchanged.

- [ ] **Smoke-test the Reviews funnel** (I can't; login-gated). In a real Willis session open **Marketing -> Google Reviews -> Overview**. You should see: KPI tiles (Asked / Clicked / Left a review / Caught privately), the three-step journey bars, a conversion line, and recent positive reviewers. If it reads empty when the pipeline has people in it, the pipeline name did not resolve (see next item).
- [ ] **Confirm the pipeline resolves by name.** The endpoint finds the pipeline by matching a name that contains "review" or "reputation", with a fallback that matches the gate stages. If Willis's review pipeline is named something else, tell me the exact name and I will pin it.
- [ ] **All Reviews / average-rating hero still need Google Business Profile.** A pipeline cannot supply star ratings or review text, so the **All Reviews** list and the big average-rating hero stay "coming soon" until GBP is connected. Same blocker as the reputation-scope item above. This is unchanged by this work.
