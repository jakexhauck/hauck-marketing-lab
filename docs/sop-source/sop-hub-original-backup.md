# SOP Hub - original seed backup

Archived on swap to Local Ads School content. This is the previous static seed from `command-center/app/src/lib/sopData.ts`.

## 📋 Onboarding

### 🔑 Client Meta Access Request
- slug: `client-meta-access`
- desc: Get Business Manager + ad account access on day 1.

<h2>When to use</h2><p>Day 1 of any new client, before anything else can be built.</p><h2>Steps</h2><ol><li>Send the client your Business Manager ID and the partner-access request link.</li><li>Request <strong>Ad Account</strong> + <strong>Page</strong> + <strong>Pixel/Dataset</strong> access.</li><li>Confirm you have the <em>Manage campaigns</em> permission, not just analyst.</li><li>Screenshot the granted access and save it to the client folder.</li></ol>

### 🏷️ Install Meta Pixel via GTM
- slug: `meta-pixel-gtm`
- desc: Tag Manager container, pixel, lead event, QA.
- video: yes (no url)

<h2>When to use</h2><p>Day 2 of onboarding for any client with a website.</p><h2>Steps</h2><ol><li>Create one GTM container per client website.</li><li>Install the two GTM snippets (head + body).</li><li>Create the Meta Pixel in Events Manager, copy the Pixel ID.</li><li>Add the base pixel as a Custom HTML tag firing on <code>All Pages</code>.</li><li>Add the Lead event tag firing on the thank-you URL.</li><li>Publish, then verify with Pixel Helper + Test Events.</li></ol>

### 🗓️ 7-Day Onboarding Pipeline
- slug: `onboarding-7day`
- desc: Day-by-day from signed to launched.

<h2>Overview</h2><p>The standard cadence that takes a client from signed to live in seven days.</p><h2>Days</h2><ul><li><strong>Day 1:</strong> Access requests + kickoff.</li><li><strong>Day 2:</strong> Pixel + audience research.</li><li><strong>Day 3:</strong> Creative (copy + images).</li><li><strong>Day 4:</strong> Client approval round.</li><li><strong>Day 5-6:</strong> Build campaign + QA.</li><li><strong>Day 7:</strong> Launch.</li></ul>

### ✅ Pre-Launch QA Checklist
- slug: `pre-launch-qa`
- desc: Everything to verify before publishing a campaign.

<h2>Before you publish</h2><ul><li>Pixel firing + Lead event confirmed.</li><li>Budget matches what the client agreed.</li><li>Naming convention correct at all 3 levels.</li><li>3 ads per ad set, diverse angles.</li><li>Tracking UTMs in place.</li><li>Billing + payment method valid.</li></ul>

## 🎨 Creative

### ✍️ Ad Copy: 12-Angle Generation
- slug: `ad-copy-12-angle`
- desc: Twelve reasons to buy, one framework each.
- video: yes (no url)

<h2>The rule</h2><p>One ad = one reason to buy. Twelve angles, not twelve rewrites of the same headline.</p><h2>Steps</h2><ol><li>List 12 distinct reasons to buy (pain, desire, logic, proof…).</li><li>Assign a framework to each (PAS, AIDA, BAB, Story).</li><li>Generate, then run the 60-second edit on each.</li><li>Kill AI words, replace vague with specific.</li></ol>

### 🖼️ Ad Image Generation
- slug: `ad-image-generation`
- desc: Prompt formula, variations, Canva polish.

<h2>Formula</h2><p><code>[Subject] in [setting], [action], [style], [lighting], [angle], [format]</code>. Leave space for text overlay. No logos/text in the AI prompt.</p><h2>Steps</h2><ol><li>Generate 3-4 variations per angle, never use the first.</li><li>Polish in Canva: headline, CTA, logo.</li><li>Mobile preview, export.</li></ol>

### 🎬 Video Ad Production
- slug: `video-ad-production`
- desc: UGC structure, hooks, editing checklist.
- video: yes (no url)

<h2>Structure</h2><p>Hook (3s) → Problem → Solution → Proof → CTA.</p><h2>Checklist</h2><ul><li>First 3 seconds stop the scroll.</li><li>Captions burned in.</li><li>Vertical 9:16, under 30s.</li><li>Real-person tone, not polished ad voice.</li></ul>

### 🔀 Creative Diversity Check
- slug: `creative-diversity-check`
- desc: Make sure every ad tests a different angle.

<h2>Why</h2><p>The algorithm finds the audience when creative is diverse and on-message.</p><h2>Check</h2><ul><li>No two live ads share the same angle.</li><li>Mix of formats: image, video, carousel.</li><li>At least one proof-led and one pain-led ad.</li></ul>

## 🚀 Build & Launch

### 🏗️ Campaign Structure & Naming
- slug: `campaign-structure-naming`
- desc: ABO vs CBO, naming convention, ad sets.

<h2>Decide ABO vs CBO</h2><p>New client or new audiences: ABO. Proven and scaling: CBO.</p><h2>Naming</h2><p>Campaign: <code>[Client] - [Goal] - [Type]</code>. Ad set: <code>[Audience] - [Location] - [Age]</code>. Ad: <code>[Format] - [Angle] - [Version]</code>.</p>

### 🎯 Broad Targeting Setup
- slug: `broad-targeting`
- desc: Let the algorithm find the audience.

<h2>Approach</h2><p>Location radius only, no interests, on broad. Age range only if relevant to the niche. Research is for messaging, not targeting.</p>

### 📁 Niche Campaign Templates
- slug: `niche-campaign-templates`
- desc: Proven starting points by vertical.

<h2>Use</h2><p>Start from the proven structure for the client's vertical instead of from scratch. Adjust budget and creative to the offer.</p>

## 📈 Optimization

### ⏱️ Daily 15-Minute Routine
- slug: `daily-15min-routine`
- desc: Kill, watch, scale, refresh, every morning.
- video: yes (no url)

<h2>Every morning</h2><ol><li><strong>Kill</strong> anything well over target CPA with enough spend.</li><li><strong>Watch</strong> the borderline performers.</li><li><strong>Scale</strong> winners 20% at a time.</li><li><strong>Refresh</strong> fatigued creative.</li></ol>

### 🔧 Troubleshooting Playbook
- slug: `troubleshooting-playbook`
- desc: Common problems and the fix for each.

<h2>Common issues</h2><ul><li><strong>High CPL:</strong> creative fatigue or wrong audience signal.</li><li><strong>No spend:</strong> budget too low to exit learning.</li><li><strong>Pixel not firing:</strong> re-check GTM + clear cache.</li></ul>

## 📊 Reporting

### 📝 Weekly Client Report
- slug: `weekly-client-report`
- desc: What to send, how to frame the numbers.

<h2>Send weekly</h2><p>Leads, CPL, spend, and one sentence on what you changed and why. Lead with the result, not the metrics dump.</p>

### 📞 Monthly Strategy Call
- slug: `monthly-strategy-call`
- desc: Agenda, retention talk track, next-month plan.

<h2>Agenda</h2><ol><li>Last month's results vs goal.</li><li>What's working / what's next.</li><li>Next month's plan + any asks.</li></ol>

### 🤖 Read Ad Data CSV with Claude
- slug: `read-ad-data-csv`
- desc: Turn an export into plain-English insight.

<h2>Steps</h2><ol><li>Export the Ads Manager CSV.</li><li>Drop it into the data-analyst skill.</li><li>Ask for revenue leaks, winners, and the next action.</li></ol>

## 💬 Client Comms

### 📉 Present a Bad Month
- slug: `present-bad-month`
- desc: Own it, explain why, show the plan.

<h2>Formula</h2><p><strong>Own it</strong> (state the metric + delta plainly), <strong>explain why</strong> (specific cause), <strong>show the plan</strong> (what's already in motion). Volunteer it before the client asks.</p>

### 🛟 Cancellation Save Script
- slug: `cancellation-save`
- desc: Turn a churn moment into a renewal.

<h2>Approach</h2><p>Acknowledge, diagnose the real reason, and offer a concrete fix or adjusted plan. Never argue the numbers.</p>

### 💰 Price Raise Conversation
- slug: `price-raise`
- desc: Raise rates without losing the client.

<h2>Approach</h2><p>Anchor on results delivered, give notice, frame the new scope. Confident, not apologetic.</p>

### 🔁 Client Communication Rhythm
- slug: `communication-rhythm`
- desc: The cadence that keeps clients calm.

<h2>Cadence</h2><ul><li>Weekly written update.</li><li>Monthly strategy call.</li><li>Proactive heads-up on any dip.</li></ul>

## 🧲 Leads & Outreach

### 🔎 Manual Lead Scraping
- slug: `manual-lead-scraping`
- desc: Find prospects worth contacting by hand.

<h2>Steps</h2><ol><li>Pick a niche + city.</li><li>Find businesses running weak ads (Ad Library).</li><li>Note a specific weakness for your opener.</li></ol>

### ⚡ Automated Lead Scraper Runbook
- slug: `automated-lead-scraper`
- desc: Run the scraper, work the list weekly.
- video: yes (no url)

<h2>Weekly</h2><ol><li><code>python scrape.py "[niche]" "[city, state]"</code></li><li>Sort the sheet by score.</li><li>Personalize outreach to the top 15. Outreach stays manual.</li></ol>

### 🌐 Niche Landing Page Outreach
- slug: `niche-landing-outreach`
- desc: Lead with a built page, not a pitch.

<h2>Approach</h2><p>Build the prospect a sample landing page first, then reach out with it. Show, don't pitch.</p>

## ⚙️ Operations

### ⚖️ Apply the 80/15/5 Work Split
- slug: `80-15-5-split`
- desc: AI does 80, VA does 15, you do 5.

<h2>The split</h2><ul><li><strong>80% AI:</strong> copy, concepts, research, report drafts.</li><li><strong>15% VA:</strong> uploads, formatting, scheduling.</li><li><strong>5% you:</strong> strategy, calls, approvals, QC.</li></ul>

### 👥 VA Hiring & Training
- slug: `va-hiring-training`
- desc: Find, vet, and onboard a virtual assistant.
- video: yes (no url)

<h2>Steps</h2><ol><li>Write the role around Loom-teachable tasks.</li><li>Trial task before hiring.</li><li>Onboard with recorded SOPs (this hub).</li></ol>

### 📦 Multi-Client Daily Batching
- slug: `multi-client-batching`
- desc: Run 7+ clients in 2-3 hours a day.

<h2>Approach</h2><p>Batch the same task across all clients (optimization, then creative, then comms) instead of finishing one client at a time.</p>
