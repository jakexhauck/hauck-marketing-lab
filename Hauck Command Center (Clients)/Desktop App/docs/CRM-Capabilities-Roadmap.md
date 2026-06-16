# CRM Capabilities Roadmap

A plain-language menu of features we can add to the CRM, drawn from what GoHighLevel (GHL) can do, scoped for **service-based business owners** (home services, med spas, gyms, contractors, clinics, coaches).

> How to read this: each item says **what it does**, **why a service owner cares**, and **how hard it is to build** given the backend we already have. Today's CRM is mostly "read and reply." Almost every gap below is about letting the app **act** on the owner's behalf: book the job, text the missed call, chase the review, collect the payment.

Last updated: 2026-06-15

---

## 0. Staff accounts (the feature we are building next)

**What it does:** Let a business owner add their own employees inside the app, each with their own email and password, instead of one shared password for everyone.

**Why a service owner cares:** The owner wants their front-desk person or sales rep to log in as themselves, see their own leads, and not share one password. It also sets up role-based access (owner sees everything, a rep sees less).

**Feasibility:** Native and fully doable in our own backend. No third-party login service needed.

- Today: one shared password per business (stored in env vars), plus an optional GHL "who are you?" picker.
- To add: a `staff_accounts` table (email + bcrypt-hashed password + role), an owner-only "add staff" screen, and a staff login. The session system already supports this without breaking current logins.

**Decisions made (full design in [`Staff-Accounts-and-Permissions.md`](./Staff-Accounts-and-Permissions.md)):**
- Staff are **mapped to GHL users by creating them** via the GHL API when added.
- Permissions use a **per-business feature set**: a staff member can only be granted what the business has, and the business can only have what the CRM offers.
- Permissions are **view vs. edit per surface**.

**Still open:**
- [ ] Verify the GHL token can create users (the one real blocker, see the spec).
- [ ] Password reset flow (needs an email sender): owner sets passwords manually in v1.

---

## Tier 1 — Highest impact, mostly buildable on the GHL access we already have

These are the features a service owner touches every single day.

### 1. Appointment booking, reschedule, cancel
- **Does:** Lets a user (or a customer via a link) actually book, move, or cancel an appointment. Right now the calendar is read-only.
- **Why:** For a service business the calendar IS the business.
- **Effort:** Moderate. Uses GHL free-slot and event endpoints we can already reach.

### 2. Missed-call text-back / speed-to-lead
- **Does:** When a call is missed, an SMS fires instantly ("Sorry we missed you, how can we help?").
- **Why:** Responding within 5 minutes is the whole game for contractors and clinics. GHL's single most-loved feature.
- **Effort:** Moderate. Needs trigger/automation wiring. Highest ROI automation we can ship.

### 3. Workflows / automation
- **Does:** Trigger on new lead, stage change, form submit, or booking, then run SMS/email/wait/condition steps automatically.
- **Why:** This is the engine behind nurture and follow-up. Even just turning existing GHL workflows on/off is valuable.
- **Effort:** Low to enable/toggle existing workflows. Large to build a full visual builder.

### 4. Reputation / review management
- **Does:** Auto-request reviews after a job, and monitor + respond to Google and Facebook reviews. GHL's new Reviews AI can draft the responses.
- **Why:** Reviews ARE marketing for service businesses. Often replaces a $300/mo tool like Birdeye.
- **Effort:** Moderate.

### 5. Invoices and payments you can create and collect
- **Does:** Create/send invoices, estimates, text-to-pay links, and recurring subscriptions. Today billing is view-only.
- **Why:** A plumber texting a pay link from the truck is a daily-use feature.
- **Effort:** Moderate. We already read the invoice and payment objects.

### 6. Forms and surveys (lead capture)
- **Does:** Show form submissions and ideally embeddable lead-capture forms that feed the pipeline.
- **Why:** Service owners live off the contact form on their site.
- **Effort:** Moderate.

### 7. Contact create / edit / custom-field write
- **Does:** Add a lead met in person, fix a phone number, tag someone. Contacts and custom fields are read-only today.
- **Why:** Basic CRM hygiene; also a prerequisite for several items above.
- **Effort:** Low. Big quality-of-life win.

### 8. Tags, smart lists, segmentation, bulk actions
- **Does:** Filter contacts by tag/source/status, save segments, and bulk-text/email or bulk-reassign a segment. Tags are fetched today but unused.
- **Why:** "Text all past customers about the spring special."
- **Effort:** Low to moderate. High daily use.

### 9. AI Employee suite (Conversation AI + Voice AI)
- **Does:** Voice AI answers inbound calls and books appointments autonomously (~70-80% of calls). Conversation AI handles SMS and webchat and books.
- **Why:** For an owner who can't answer the phone on a ladder, this is the headline pitch. GHL's 2026 flagship.
- **Effort:** Large. Depends on phone/number provisioning. Most marketable capability, but build it after the daily-use basics.

---

## Tier 2 — Strong value, more build effort

### 10. Email / SMS broadcast campaigns
One-to-many sends to a segment (promotions, seasonal offers, re-engagement), with templates and snippets.

### 11. Appointment reminders / no-show reduction
Automated reminder sequences before appointments. No-shows are pure lost revenue for service businesses; this pays for itself.

### 12. Estimates, proposals, documents and contracts (e-sign)
Quote-to-invoice and e-signature documents. Contractors and agencies send quotes daily.

### 13. Funnels and landing pages
Drag-and-drop lead-capture pages. May overlap with existing website work; useful for client microsites and campaign pages.

### 14. Team assignment and rep performance
Assign leads to staff, filter "my leads," track per-rep close rates. Pairs directly with the staff-accounts feature in section 0.

### 15. Real paid-ads integration
The Paid Ads screen is live UI on mock data today. Wiring Meta/Google (or GHL ad reporting) makes it real. Squarely in our wheelhouse since we run Meta ads.

### 16. Call tracking, recording, dedicated numbers
Provisioned tracking numbers, call recording, and call attribution so an owner knows which campaign drove which call.

---

## Tier 3 — Maybe, but worth knowing

Lower priority for most service owners, included for completeness.

- **Memberships, courses, communities** — only for clients who sell knowledge/coaching.
- **Social planner / Content AI** — schedule and AI-draft social posts. Nice-to-have.
- **Trigger links and QR codes** — trackable links/QRs for attribution. Minor.
- **Affiliate manager** — referral/affiliate tracking. Niche.
- **Blogs and Funnel AI page generation** — content tooling; overlaps website work.
- **Products catalog / online store** — only for product-selling clients.
- **Advanced reporting / attribution dashboards** — revenue-by-source, funnel analytics. Valuable as we scale, heavier to build well.
- **Real-time webhooks** — we poll today; GHL can push events for instant updates and to power the speed-to-lead automations above. Low effort, an enabler.
- **White-label / multi-location (sub-accounts)** — only matters if we productize this CRM and resell it under our brand. Could be a business model, not just a feature.

---

## Suggested priority order for service-business clients

The six things an owner touches daily, most of which ride on the GHL access we already have:

1. Appointment booking, reschedule, cancel
2. Missed-call text-back / speed-to-lead
3. Reputation / reviews
4. Invoice + payment collection
5. Contact create / edit
6. Appointment reminders

Treat the AI Employee suite (Voice AI) as the headline feature to add **after** the daily-use basics are solid.

---

## Quick reference: today vs. the gap

| Area | Today | Gap to close |
|---|---|---|
| Leads / pipeline | Read, move, update | Custom fields, bulk actions, assignment |
| Contacts | Read, search | Create, edit, custom-field write, segments |
| Conversations | Read, send (8 channels) | Broadcast campaigns, templates, AI replies |
| Calendar | Read-only agenda | Booking, reschedule, cancel, reminders |
| Billing | Read-only | Create/send invoices, text-to-pay, estimates |
| Reviews | None | Request, monitor, respond (+ Reviews AI) |
| Automation | None | Workflows, missed-call text-back |
| Phone/Voice | None | Call tracking, Voice AI receptionist |
| Staff | Shared password | Native per-staff accounts (section 0) |
| Paid ads | Mock data | Live Meta/Google integration |
