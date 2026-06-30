# Sales & Call System — Build Plan (living)

Status: in design · started 2026-06-30 · client #1 = Willis Windows (window cleaning, Metro Detroit)

Built page by page with Jake. **DECIDED** = locked. **TO VERIFY** = needs a real check before build. **OPEN** = still to decide.

---

## 1. North star

One lead record, surfaced through the right lens at each step.

- **Channels capture** the lead → the **Sales spine** works it to **Job Booked → Job Completed**.
- The engine in the middle is the **phone** — a shared **Call Console** that logs the outcome and routes the lead with one tap.
- There is only ever **one** GHL opportunity per lead. We never copy it. Every page and the inbox are filtered views of the same data.

---

## 2. The pipelines (pulled live from GHL, identical template for every client)

| Pipeline | ID | Role |
|---|---|---|
| Paid Ad's Pipeline | `uz0fFxCgiwdXbg4Zmwkc` | Channel · has intro-call stages |
| Organic Pipeline | `NSkPBlP8BcPTtyibNEIu` | Channel · forms + chat, no intro call |
| Database Reactivation Pipeline | `A7PNIqk4Fg1HINtirAmR` | Channel · old customers, no intro call |
| Google Review Campaign Pipeline | `R76ncRGrODiJuDJJTUWR` | Reputation loop · no sales handoff |
| Sales Pipeline | `6o9Gx6e0TXRFJdln5d01` | The spine |

**Sales Pipeline stages:** Intro Call Confirmed → Estimate Scheduled → Estimate Completed → Job Booked → Job Completed · off-ramps: No-Close, Follow Up, Abandoned.

**Two entry points into the spine:**
- **Paid Ads** runs an intro call → enters Sales at **Intro Call Confirmed**.
- **Organic + Reactivation** skip intro calls → enter Sales at **Estimate Scheduled**.

---

## 3. Page map (the structure)

**Capture pages (one per source):**
- 📣 Paid Ads — Paid Ad's Pipeline — `/marketing/paid-ads`
- 📝 Estimate Forms — Organic Pipeline, `source = "Website Form"` — `/leads/forms`
- 💬 Chat Widget — Organic Pipeline, `source = "chat widget"` — `/leads/chat`
- 🔄 Reactivation — Database Reactivation Pipeline — `/marketing/campaigns/reactivation`
- ⭐ Google Reviews — Google Review Campaign Pipeline — `/marketing/reviews`

**Sales pages (the Sales Pipeline, sliced by stage):**
- 📞 Intro Calls — Sales Pipeline @ Intro Call Confirmed — `/sales/intro-calls` (fed by Paid Ads)
- 📐 Estimates — Sales Pipeline @ Estimate Scheduled + Completed — `/sales/estimates`
- 🗓️ Jobs — Sales Pipeline @ Job Booked + Completed, calendar view — `/sales/jobs`

**Cross-cutting surfaces:**
- 📨 Unified Inbox — all conversations, every channel — `/inbox` (see §6)
- 📞 Call Console — the shared on-call screen, opened from anywhere (see §5)

Reference visual: `lead-flow-map.html`

---

## 4. DECIDED — Estimate Forms page (Mockup C)

**Layout: Conversation Inbox.**
- **Left:** list of submissions, filterable by status (New / Awaiting reply / Replied / Scheduled / Not qualified).
- **Right:** the selected lead — contact header, top action bar, conversation, composer.

**The flow it serves:** form submitted → auto email + SMS fire → lead replies with what they want → rep picks a next step. Quotes are given **on the phone**, never over text.

**Top action bar** (sits directly under the contact, NOT at the bottom):
- 📞 **Call now** → opens the Call Console
- 🗓️ **Schedule a call** → pick a callback time → shows on Today
- 📐 **Book in-person visit** → pick a time → Estimate Scheduled + Calendar
- ⋯ **Other** → Not qualified / out of area / no answer

**Conversation:** split into two tabs — **💬 SMS** and **✉ Email**. Each has its own thread and its own reply box (composer follows the active tab). Compact density.

Mockup: `mockups/estimate-forms/C-conversation-inbox.html`

> **Chat Widget page** is the same page, same Organic pipeline, same Call Console — only the source filter differs (`"chat widget"` instead of `"Website Form"`). One pipeline, two filtered pages.

---

## 5. DECIDED — Call Console (the shared "on the call" screen)

One screen, reused everywhere a call happens (Estimate Forms, Chat Widget, Intro Calls, callbacks, inbound). Dark "call mode" look, live timer, mute, end call.

- **Left:** everything to talk about — who they are, what they want, the offer to mention ($100 off + free screen cleaning), talking points. No scrolling.
- **Right:** one-tap outcomes that log + route.

**Outcome → routing table:**

| Tap | Captures | Routes to |
|---|---|---|
| ✅ Booked the job | quick price | Job Booked → Jobs page |
| 📐 Booked in-person visit | pick time | Estimate Scheduled → Estimates + Calendar |
| ↻ Follow up later | callback time | Follow Up → Today |
| 📭 No answer / voicemail | one tap | No answer (auto-retry) |
| 🚫 Not qualified | one tap | off-ramp |

**Inbound calls** — a screen pop appears when the phone rings:
- **Known caller** (number matches) → console pre-filled with their context.
- **Unknown caller** → console opens in **capture mode**: name, what they want, ZIP, "how'd you hear about us" (sets the source). Any outcome creates a new lead, tagged + routed. Nothing typed twice.

Mockups: `mockups/call-console/call-console.html` · `mockups/call-console/inbound-call.html`

---

## 5b. DECIDED — Telephony approach (frictionless, no softphone for now)

The business number IS the GHL number, and it forwards to the owner's cell.

**The owner's entire effort = tap one notification:**
1. Customer calls the GHL number → forwards to the owner's cell → they answer normally.
2. GHL fires a call webhook → Command Center sends a **push notification** with the caller's context.
3. Owner **taps the push** → PWA opens straight to the Call Console for that exact lead (deep-linked).
4. Owner **taps the outcome** → logged + routed.

If not tapped mid-call, the notification waits — tap after hang-up, log in two seconds.
- **At a desk:** console runs live on the desktop (second screen).
- **In the field:** console pops the instant the call ends.

**Build order (de-risked):**
- **Route 1 first** — after-call console + push notifications + outbound click-to-call. Cheap, fast, proven.
- **Route 2 later** — our own Twilio WebRTC softphone so calls ring *inside* the app. Heaviest piece; GHL won't lend us its dialer, so it needs our own Twilio voice layer (GHL number forwards to it). Only if we want true in-app audio.

Diagram: `mockups/call-console/call-routing.html` · Mobile flow: `mockups/call-console/mobile-frictionless.html`

---

## 6. DECIDED — Unified Inbox

All conversations, every channel, in one place. A **lens on the same GHL conversations** the sales pages use — never a separate copy.

**Two filter dimensions (the key idea):**
- **Channel** = how they're messaging now: 💬 SMS · ✉ Email · 📷 Instagram · 💬 Messenger
- **Source** = where the lead came from: 📝 Estimate Form · 💬 Chat Widget · 📣 Paid Ad · 🔄 Reactivation · 📞 Inbound Call

So you can filter "SMS" and narrow to "Chat Widget leads only," any combination.

**Context on every conversation:**
- A colored **source badge** on every thread (even an all-SMS list shows where each person came from).
- An **origin strip** in the conversation header: "💬 Chat Widget · first came in via website chat · Jun 27 · Organic Pipeline · Warren."
- A **first-touch flag** in the thread marking where the very first message originated before it moved channels.

Badges are derived from **real fields** (verified in GHL): the `source` field (`"Website Form"` / `"chat widget"`), the pipeline (Paid Ad / Reactivation), and inbound-call capture. Nothing invented.

Mockup: `mockups/unified-inbox/unified-inbox.html`

### 6b. DECIDED — How the inbox and the work-pages intertwine (no overlap)

**Governing rule: one conversation, never copied.** Every message lives once in GHL. The inbox and the Estimate Forms / Chat Widget threads are lenses on it; a reply from either writes to the same thread and appears in both.

**Two lenses, two jobs:**
- **Unified Inbox** = channel-first. Job: "reply to anything, anywhere." Has every thread, no sales actions.
- **Sales work pages** = lead/stage-first. Job: "work this lead to a sale." A scoped slice **plus the action bar** (Call now / Book visit / outcomes) the inbox doesn't have.

**Guardrails:**
1. **One primary home per conversation.** A thread tied to an active estimate-form / chat-widget lead is **worked on its sales page**. The inbox shows it but flags + deep-links: "Open in [Chat Widget] workflow →." It doesn't try to close it.
2. **Inbox is the catch-all for channels without a page** (Instagram, Messenger, loose SMS). Those get worked in the inbox; if one becomes a real lead, an opportunity is created and it joins the spine.
3. **Cross-link, never fork.** Surfaces point at each other; never separate copies or reply states.

---

## 7. TO VERIFY (before/at build)

- **GHL inbound-call webhook timing** — fires when the call *starts* (enables live console) or only when it *ends* (after-call console)? Make-or-break for "live" vs "instant after." Same build either way.
- **GHL voice/SDK access** — needed only for Route 2 (in-app softphone).
- **Origin tagging** — pulled 82 Willis contacts: **0 have any tags**. Routing currently relies on the `source` field + pipeline. Confirm where Jake's "tag of where they came from" is actually applied (contact vs opportunity vs not-yet-live).
- **Outbound dial mechanism** — `tel:` link on mobile vs a Twilio bridge.
- **Unified inbox status** — already built or to-build? Decides when we wire the deep-link handoff.
- **Jobs date/time source** — the Sales opportunity carries stage + value but not the scheduled slot. Confirm whether the job's date/time lives on a linked GHL appointment or a date custom field (drives the calendar join).
- **Jobs payment source** — where Willis records that a completed job is paid (GHL invoice/payment record vs a "paid" custom field).

## 8. OPEN (decide with Jake)

- Where do **unknown inbound leads** live — Organic + source, or a dedicated "Phone / Inbound" view?
- Is the **price/quote field** required on "Booked," or added later?
- **Multi-rep routing** — ring all reps until grabbed, or route to one?
- Channel tabs default — always SMS, or open whichever they last replied on?
- `source = none` Organic leads (62 of 82) — default to Estimate Forms page, or an "Unsorted" bucket?

---

## 9. Pages still to configure

- [x] Estimate Forms (Mockup C) — **BUILT** 2026-06-30: `/sales/forms` → `src/routes/sales/EstimateForms.tsx`, demo-aware conversation inbox (data `src/lib/estimateForms.ts`), terminal actions gated. Replaced the old simple list page. Connections backlog: `command-center/app/docs/connections/estimate-forms.md`.
- [x] Call Console (shared) + inbound + telephony approach
- [x] Unified Inbox (channel + source) + inbox/work-page rule
- [x] Chat Widget — **BUILT** 2026-06-30: `/sales/chat` → `src/routes/sales/ChatWidget.tsx`. Extracted the shared `ConversationInbox` surface (`src/components/sales/ConversationInbox.tsx` + types in `src/lib/leadInbox.ts`); Estimate Forms + Chat Widget are now both thin config wrappers over it (source = "chat widget", chat-flavoured copy + demo data `src/lib/chatWidget.ts`, hook `useChatWidget.ts`). Terminal actions gated. Connections backlog: `command-center/app/docs/connections/chat-widget.md`.
- [ ] Intro Calls — paid-ads entry into the spine
- [ ] Estimates
- [x] Jobs (calendar) — **BUILT** 2026-06-30 (Mockup V3 "Split — calendar + day"): `/sales/jobs` → `src/routes/sales/Jobs.tsx`. Month calendar (left) + selected-day job cards (right) over the Sales Pipeline @ Job Booked + Job Completed. Demo-aware (data `src/lib/jobsPipeline.ts`, hook `useJobs.ts`); honest computed month summary (booked/completed/unpaid/collected); per-job action bar (Mark completed / Reschedule / Message / Payment · unpaid → Record payment / Resend invoice; paid → Ask for review), all gated. Real session = empty calendar + not-connected notice. Verified `tsc` + `npm run build` + live demo in both themes. Connections backlog: `command-center/app/docs/connections/jobs.md`. Mockup: `mockups/jobs/v3-split.html`.
- [x] Paid Ads (V3 friendly lead list) — **BUILT** 2026-06-30: `/sales/paid-ads` → `src/routes/sales/PaidAds.tsx`, demo-aware lead-first worklist over the real Paid Ad's Pipeline (data `src/lib/paidAdsPipeline.ts`, hook `usePaidAdsLeads.ts`); funnel strip + stage chips + per-lead journey bar + slide-over detail with intro-call action bar (Call now / Book intro call / Confirm → Intro Calls / Other off-ramps), all terminal actions gated. Connections backlog: `command-center/app/docs/connections/paid-ads-sales.md`.
- [ ] Reactivation
- [ ] Google Reviews

---

## 10. Mockup index

| Surface | File |
|---|---|
| Architecture / page map | `lead-flow-map.html` |
| Estimate Forms page | `mockups/estimate-forms/C-conversation-inbox.html` |
| Call Console (outbound) | `mockups/call-console/call-console.html` |
| Inbound call (ring + capture) | `mockups/call-console/inbound-call.html` |
| Call routing (two layers) | `mockups/call-console/call-routing.html` |
| Frictionless mobile flow | `mockups/call-console/mobile-frictionless.html` |
| Unified Inbox | `mockups/unified-inbox/unified-inbox.html` |
| Paid Ads · V1 stage rail | `mockups/paid-ads/v1-stage-rail.html` |
| Paid Ads · V2 kanban | `mockups/paid-ads/v2-kanban.html` |
| Paid Ads · V3 lead list (**picked**) | `mockups/paid-ads/v3-lead-list.html` |
| Jobs · V3 split calendar + day (**picked, built**) | `mockups/jobs/v3-split.html` |
