# Client Onboarding Plan — Every New Client, Every Time

Source: AI Advertiser course (Brez Scales), Modules 3–5. This is the master checklist for taking a signed client from "contract signed" to "ads optimizing on autopilot."

Work top-to-bottom. Don't skip phases. Mark each item complete in the per-client folder under `media-buying/clients/<client>/`.

---

## PHASE 0 — Pre-Kickoff (Day 0, before client even sees a form)

- [ ] Create client folder: `media-buying/clients/<client-name>/`
- [ ] Subfolders: `assets/`, `creatives/`, `reports/`, `sops/`, `chats/`
- [ ] Drop signed contract + invoice into `assets/contracts/`
- [ ] Add client to `clients.json` in app config (name, niche, monthly retainer, ad spend budget)
- [ ] Set per-client benchmarks (CPL target, CPM range, CTR floor, ROAS target) in app

---

## PHASE 1 — Discovery & Intake (Days 1–2)

**Goal: collect everything before touching an ad account.**

- [ ] Send onboarding form (26-item checklist, course §3.1) covering:
  - Business basics (name, address, hours, service area radius)
  - Target customer (demographics, pain points, objections)
  - Offer (lead magnet, promo, price points, guarantees)
  - Existing assets (logo, brand colors, photos, video, testimonials)
  - Competitors (3–5 direct, with URLs)
  - Tracking access (website CMS, GTM, GA4, CRM)
  - Lead handling (who answers, response time, follow-up sequence)
- [ ] 45-min kickoff call — record it, transcript into `chats/kickoff-transcript.md`
- [ ] Run the **Creative Brief Builder** in the app — produces voice profile + angle bank
- [ ] Document offer + USP in `assets/offer.md`

---

## PHASE 2 — Budget & Strategy (Day 2)

- [ ] Calculate ad budget using course §3.2 math:
  - Target CPL × leads needed = monthly spend floor
  - Validate against client retainer (spend should be 5–10× retainer typically)
- [ ] Set ROAS / CPL target — write into `clients.json` benchmarks
- [ ] Choose niche template (course §3.12): Restaurant / Real Estate / Home Services / Med Spa / Gym / Custom
- [ ] Map campaign structure: Campaign → Ad Set → Ad (course §3.6)
- [ ] Naming convention locked: `[Client]_[Objective]_[Audience]_[Date]`

---

## PHASE 3 — Account & Tracking Setup (Days 3–5)

### Meta Business Manager (course §3.3, §3.4)
- [ ] Client creates/owns Business Manager (NEVER us — agency access only)
- [ ] Verify BM is verified (domain verification done)
- [ ] Ad account created inside client's BM
- [ ] Payment method on file (client's card, not ours)
- [ ] Add Hauck Marketing as Partner with Admin access to: Ad Account, Page, Pixel, Catalog (if applicable)
- [ ] Spend limit set on ad account

### Page & Identity
- [ ] FB Page admin access confirmed
- [ ] IG account connected to FB Page (Professional/Business mode)
- [ ] Instagram access granted via Meta Business Suite

### Pixel & Conversions API (course §3.5)
- [ ] Meta Pixel installed via GTM
- [ ] CAPI configured (server-side via GTM Server, Stape, or native)
- [ ] Standard events firing: PageView, ViewContent, Lead, Purchase (as relevant)
- [ ] Test events tab green for all events
- [ ] Domain verified in BM
- [ ] Aggregated Event Measurement: 8 events prioritized

### Tracking Audit
- [ ] Run the **Tracking Audit Walkthrough** in the app — every check green before launch
- [ ] Document gaps in `assets/tracking-audit.md`

---

## PHASE 4 — Creative Production (Days 4–7)

**Run in parallel with Phase 3. Build in this exact order — every time, every client. No skipping steps, no working out of sequence.**

### STEP 1 — Strategy doc first (1 hour)
Before you write a single word or open Canva, this gets locked in `assets/strategy.md`:
- [ ] **Offer** — the one thing we're selling (e.g., "$99 first window cleaning")
- [ ] **Audience** — who specifically (e.g., "homeowners 35–65, 20mi radius around Phoenix")
- [ ] **Pain point** — what's bugging them (dirty windows, no time, embarrassed when guests come over)
- [ ] **Desire** — what they actually want (a clean home, peace of mind, one less chore)
- [ ] **Objections** — top 3 reasons they'd say no (price, trust, "I'll do it myself")
- [ ] **Proof** — what we have (testimonials, before/afters, years in business, reviews)

Everything downstream is built off this doc. If it's wrong, the ads are wrong.

### STEP 2 — Angles (30 min)
- [ ] Open the **Creative Brief Builder** in the app
- [ ] Generate **5 distinct angles** (not 12 — focus). Examples for Willis Windows:
  1. Embarrassment angle ("Don't let guests see this")
  2. Time-saving angle ("Get your Saturday back")
  3. Curb appeal / home value angle
  4. Spring cleaning seasonal angle
  5. Social proof / neighborhood angle ("Your neighbors already booked")
- [ ] Save to `creatives/angles.md`
- [ ] **Pick top 3** to actually build. Park the other 2.

### STEP 3 — Hooks (45 min) — *Hooks before copy. Hooks before visuals. Always.*
For each of the 3 angles:
- [ ] Run **Hook Generator** in the app
- [ ] Produce **10 hooks per angle = 30 total**
- [ ] Cull to **top 3 per angle = 9 hooks**
- [ ] Save to `creatives/hooks.md`

A hook is the first line / first 1.5 seconds. If the hook doesn't stop the scroll, nothing else matters.

### STEP 4 — Primary text / body copy (1 hour)
For each of the 9 surviving hooks:
- [ ] Run **Copywriter skill** — pick ONE framework per angle (don't mix):
  - Angle 1 → PAS (Problem-Agitate-Solution)
  - Angle 2 → BAB (Before-After-Bridge)
  - Angle 3 → Story
- [ ] Output: 5–7 lines max, 6th-grade reading level, one clear CTA per ad
- [ ] Save to `creatives/copy/<angle-name>.md` (one file per angle)

### STEP 5 — Headlines (30 min)
*Headline = the bold text under the image. Separate from the hook.*
- [ ] Generate **5 headlines per angle = 15 total**
- [ ] Cull to **top 2 per angle = 6 headlines**
- [ ] Keep under 40 characters where possible
- [ ] Save into the same copy files

### STEP 6 — Compliance pass (15 min)
Before any visuals get built, scrub the copy:
- [ ] No fake urgency ("only 3 spots left" when there aren't)
- [ ] No income/results guarantees we can't back up
- [ ] No "you" targeting that implies personal attributes (Meta hates this)
- [ ] No before/after weight loss / health claims
- [ ] No clickbait that doesn't deliver
- [ ] Flag anything questionable in `creatives/compliance-notes.md`

### STEP 7 — Visual concepts (30 min) — *Now we storyboard, not design.*
For each of the 3 angles, decide the visual treatment BEFORE opening Canva:
- [ ] Format mix per angle: 1 static image + 1 carousel + 1 short video (or UGC-style)
- [ ] Reference image for each (screenshot competitor ads from Meta Ad Library, save to `creatives/<angle>/refs/`)
- [ ] Write 1-line shot description per asset in `creatives/visual-brief.md`

### STEP 8 — Asset gathering (1–2 hours)
- [ ] Pull client photos from their Google Drive / phone (before/afters, team, trucks, completed jobs)
- [ ] If thin: schedule a 30-min phone shoot with client — give them a shot list
- [ ] Pull testimonials (text + video if available)
- [ ] Save raw assets to `creatives/raw/`

### STEP 9 — Static image ads (2 hours)
- [ ] **3 angles × 1 static = 3 static ads** (Canva + Google Stitch / Freepik AI for backgrounds)
- [ ] Match copy + headline + hook from Steps 3–5 to each visual
- [ ] Export 1080×1080 (feed) AND 1080×1920 (stories/reels) versions
- [ ] Save to `creatives/<angle>/static/`

### STEP 10 — Carousels (1.5 hours)
- [ ] **3 angles × 1 carousel = 3 carousels** (5 frames each)
- [ ] Frame 1 = hook, Frames 2–4 = build value/proof, Frame 5 = CTA
- [ ] Save to `creatives/<angle>/carousel/`

### STEP 11 — Video / Reel (2 hours)
- [ ] **3 angles × 1 video = 3 videos**, 15–30 seconds each
- [ ] First 1.5 seconds = the visual hook (text overlay matching Step 3 hook)
- [ ] Use real client footage if available; if not, Runway / Kling for AI b-roll
- [ ] Captions burned in (80% watch with sound off)
- [ ] Save to `creatives/<angle>/video/`

### STEP 12 — Client approval gate (24-hour turnaround)
- [ ] Compile everything into a single Loom or Google Slides
- [ ] Send to client with a "approve / change / kill" checkbox per asset
- [ ] **Do NOT proceed to Phase 5 until written approval**
- [ ] Log approvals in `creatives/approvals.md`

### Landing Page (if the offer needs one)
- [ ] Single-niche landing page (course bonus: "Niche Landing Page in 10 Min")
- [ ] Pixel + CAPI firing on LP
- [ ] Lead form / Calendly / phone CTA tested end-to-end
- [ ] Thank-you page = conversion event

**Total Phase 4 output: 9 ads (3 statics + 3 carousels + 3 videos), built in a defined order, all traceable back to the strategy doc.**

---

## PHASE 5 — Campaign Build (Day 7–8)

**Build the campaign in this exact order. Do NOT load ads until the structure is locked.**

### STEP 1 — Campaign shell (15 min)
- [ ] Create campaign in Ads Manager
- [ ] Naming: `[Client]_[Objective]_[Date]` → e.g., `WillisWindows_Leads_2026-05`
- [ ] Objective: **Leads** (local services) or **Sales** (eCom) — match the niche template
- [ ] Advantage+ Campaign Budget ON (CBO) for first launch unless client has history justifying ABO
- [ ] Daily budget = monthly target ÷ 30 (from Phase 2 math)
- [ ] Special ad category set if applicable (housing, employment, credit, social issues)
- [ ] **Do NOT publish yet**

### STEP 2 — Ad set structure (20 min)
**Standard launch = 1 campaign, 1 ad set.** Don't fragment audiences on day one.
- [ ] Ad set name: `[Client]_[Audience]_[GeoRadius]` → e.g., `WillisWindows_Homeowners35-65_20mi-Phoenix`
- [ ] Conversion location: Website (or Calls / Forms per offer)
- [ ] Performance goal: Maximize leads / conversions
- [ ] Conversion event: the specific pixel event from Phase 3 (Lead, Purchase, etc.)
- [ ] Budget: leave at CBO unless ABO chosen
- [ ] Schedule: start Mon or Tue morning, no end date
- [ ] **Audience: location radius only** (course §3.10). No interest stacks. Advantage+ Audience ON, age 25–65, all genders, English.
- [ ] Placements: **Advantage+ Placements ON** (full mix)

### STEP 3 — Ad slots (in this order)
Load **3 ads per ad set** at launch — one per angle, mixed formats:
- [ ] Ad 1 = Angle 1 static (your strongest hook + strongest visual)
- [ ] Ad 2 = Angle 2 video (different angle, different format)
- [ ] Ad 3 = Angle 3 carousel (third angle, third format)

For each ad slot:
- [ ] Identity: client's FB Page + connected IG
- [ ] Format: matches the asset
- [ ] Media: upload the approved file from Phase 4
- [ ] Primary text: paste from `creatives/copy/<angle>.md`
- [ ] Headline: paste matching headline
- [ ] Description: one short line if relevant
- [ ] Destination: website URL with full UTMs: `?utm_source=meta&utm_medium=paid&utm_campaign=<campaign>&utm_content=<angle>-<format>`
- [ ] CTA button: "Get Quote" / "Book Now" / "Learn More" — match the offer
- [ ] Tracking: pixel + CAPI ON, dataset confirmed

### STEP 4 — Pre-flight check (30 min) — every box must be ticked
- [ ] Preview each ad on Facebook Feed (mobile + desktop)
- [ ] Preview each ad on Instagram Feed
- [ ] Preview each ad on Stories and Reels
- [ ] Click every CTA — does the LP load? Does the form submit? Does the event fire in Test Events?
- [ ] Spend cap on the ad account set
- [ ] Billing threshold reviewed with client
- [ ] All 3 ads show green "Ready" status

### STEP 5 — Hold for launch window
- [ ] If it's Wed–Sun, schedule for next Mon/Tue 8am
- [ ] If it's Mon/Tue AM, publish immediately
- [ ] Send client a "going live at <time>" message

---

## PHASE 6 — Launch (Day 8)

- [ ] Final client sign-off via Loom walkthrough
- [ ] Schedule launch for Monday or Tuesday AM (avoid Fri/weekend learning)
- [ ] Publish campaigns
- [ ] Confirm spend pacing within first 4 hours
- [ ] Confirm events firing in Events Manager
- [ ] Send "we're live" email/Loom to client

---

## PHASE 7 — Learning Phase Management (Days 8–15)

- [ ] Do NOT touch ad sets for 3–4 days unless catastrophic
- [ ] Daily 15-min routine (course §3.11): Scan → Decide → Execute → Log
- [ ] Log every change in `reports/change-log.md`
- [ ] Day 7: first optimization pass — kill bottom 20%, scale top 20%
- [ ] Day 14: exit learning phase review; rebuild any ad set still in learning

---

## PHASE 8 — Ongoing Operations (Week 3+)

### Daily (15 min)
- [ ] Spend pacing check
- [ ] CPL / ROAS vs benchmark
- [ ] Frequency check (kill at 3.0+ on cold)
- [ ] Comments moderated, leads responded to within 5 min (client side)

### Weekly
- [ ] Creative refresh: 2–3 new ads into winning ad sets
- [ ] Audience fatigue check (CPM trend, CTR drop)
- [ ] Loom update to client (3–5 min)
- [ ] Competitor scan via Ad Library (course §5.11)

### Monthly
- [ ] Full report via **Report Builder** in the app
- [ ] Strategy call with client
- [ ] ROI calculator updated
- [ ] Pricing review at month 3, 6, 12 (course §4.3 ladder: $1.5K → $3K → $5K)

---

## PHASE 9 — AI Layer (Set up once per client, course §5)

- [ ] Connect Meta Ads MCP to client ad account
- [ ] Configure 4-agent loop: Monitor / Optimizer / Reporter / Alert Manager
- [ ] CSV/Sheets pipe for **data-analyst skill**
- [ ] Weekly auto-report drops into `reports/auto/`
- [ ] Alert rules: CPL > 1.5× target, spend < 50% pace, frequency > 3.5, CTR < 0.8%

---

## PHASE 10 — Retention & Scale (Month 2+)

- [ ] Monthly strategy call rhythm locked (course §3.13)
- [ ] At least one "win" surfaced per month in client comms
- [ ] Upsell menu ready (course §5.12): automation, landing page funnels, email/SMS, creative volume, reporting dashboard — $3K–4K/mo add-ons
- [ ] Quarterly account audit
- [ ] Year 1 case study drafted

---

## Standing Rules (apply to every client, always)

1. **Client owns everything.** BM, ad account, pixel, page, domain. We have access — we never hold the keys.
2. **Tracking before traffic.** No launch with red events in Test Events.
3. **Creative is the targeting.** Don't waste time on interest stacks. Build more angles.
4. **Log every change.** If it's not in `reports/change-log.md`, it didn't happen.
5. **One source of truth.** The client folder. Not Slack, not your head.
6. **Compliance first.** Anything that smells like a Meta violation gets rewritten before submission.

---

*Last updated: 2026-05-11. Revise whenever the course ships a new module or a real client teaches us something the course missed.*
