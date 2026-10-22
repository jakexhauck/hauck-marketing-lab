---
name: sales-call-brief
description: Use when Jake wants a custom pre-call brief for a sales/demo call prospect, triggers like "make a brief for my call", "game plan brief for the call at 5", "prospect brief", "market brief for <business>", "competitor research for the call", "show him his market before the call", or names a booked Hauck Marketing Demo Call. Builds the approved Comfort Lab format every time: market size, competitor table with who runs Facebook ads, their live ad creatives + primary text from the Meta Ad Library, improvements the prospect could make, and the "quiet season now, busy season even better" chart, published at brief.hauckmarketing.com/<slug>.
---

# Sales Call Brief

One web page Jake screen-shares at the start of a sales call. It is not a pitch: no pricing, no offer, no "what we'll do". It makes the prospect feel the size of his market, see that competitors are thin and weak on Facebook, and feel that now is the moment to start.

Gold example: `agency/briefs/src/comfort-lab/brief.html` (live at https://hauck-briefs.pages.dev/comfort-lab/). **Copy it as the template every time.** Do not redesign.

## When to Use This Skill

- Jake has a sales/demo call booked and wants something to show the prospect.
- "Make a brief / game plan / market breakdown for <prospect>".
- Do **not** use for client-facing reports on existing clients (use `data-analyst`) or ad copy (use `copywriter`).

## The Format (fixed, in this order)

1. **Cover**: byline (`Prepared for <b>First name, Business</b>` · `Hauck Marketing · <date>`) + one statement H1 (e.g. "Madison is wide open on Facebook.").
2. **Homeowners**: H2 "There are <em>N+ homeowners</em> in your backyard." + 3 figures: homeowners (owner-occupied households, rounded down, "141,000+"), median home value, median household income. County level, Census QuickFacts / DataUSA.
3. **Competitors**: H2 "Most of <City>'s big <trade> shops <em>aren't on Facebook.</em>" + big count (`N running ads for homeowners` / `N not running any`) + table: Company, Google reviews, In business, Facebook ads today. Prospect is the last row (`class="you"`).
4. **Their ads**: H2 "And the ones who are <em>look like this.</em>" + one card per creative: name, "Live since <date>", creative image, primary text **verbatim** (emojis included), 3 factual tags (offer type, price, format). No written critique; Jake roasts them live.
5. **Improvements**: H2 "Improvements <Business> could make." Numbered list of 4-6 fixes from his real footprint (reviews gap, NAP/phone mismatches, broken links, Google categories, no ads). Bold title + one factual line each.
6. **Timing**: H2 "Right now is the quiet stretch. <em>That's why you start now.</em>" + the single rising-line chart ("Now: ads perform well" → "Busy season: even better"). Shift the month labels so the chart starts at the current month and ends at the trade's peak (HVAC heating: Oct→Feb; AC/roofing/windows: adjust).
7. **Footer**: one line of sources.

## Hard Rules (Jake's calls, do not drift)

- **No sub-text under any heading or graph.** No intro lines, no legends, no "illustrative" notes, no explainer paragraphs. Statement headings carry the message.
- **No pitch content**: no pricing, packages, install-revenue ladders, rebates, or "what Hauck will do".
- **Must not feel AI-made**: white page, deep green ink, Poppins/Inter, statement headings, no dashboard tiles, no chips everywhere, no numbered eyebrows.
- **"Running" only for competitors whose ads appear on the page.** Everyone else shows "None", "None found", or "Hiring ad(s) only". Counts match the table.
- **No em dashes** anywhere. `build.py` refuses to build with one.
- Unverified research never goes on the page as fact. Leave it out.

## Workflow

1. **Find the prospect.** Google Calendar `list_events` for today; the "Hauck Marketing Demo Call" event carries name, email (domain = website) and phone. WebFetch the website for city, service area, services.
2. **Ask Jake (AskUserQuestion, one round)**: what he knows (lead source, size, goals) and anything to emphasise. Don't ask about format; it's fixed.
3. **Research in the background** (one `general-purpose` agent, run_in_background). Prompt it for:
   - 10-12 biggest local competitors: Google rating + review count, years, franchise/PE signal.
   - Each competitor's active Meta ads (Ad Library keyword search), counts, hooks, start dates. Mark unverified.
   - Prospect's footprint: Google rating/reviews/category, phone shown on site vs Google vs Facebook, Facebook page + followers, broken links, ads.
   - County owner-occupied households, median home value, median household income with sources.
   - No em dashes, under ~1200 words.
4. **Get the Ad Library links from Jake** for the competitors he wants shown (he picks; usually 2-4). Capture 1-2 live ads each, see "Capturing creatives".
5. **Fill the template**: `mkdir agency/briefs/src/<slug>/creatives`, copy `agency/briefs/src/comfort-lab/brief.html` to `agency/briefs/src/<slug>/brief.html`, replace content section by section. Images as `{{IMG:creatives/<file>.jpg}}`. Update `<title>` to "<Business> Market Brief".
6. **Build**: `python .claude/skills/sales-call-brief/scripts/build.py <slug>`.
7. **Private preview first**: publish `agency/briefs/src/<slug>/artifact.html` with the Artifact tool (icon `chart`). Jake reviews and edits there.
8. **Deploy** once Jake is happy (or immediately if the call is soon):
   ```bash
   export CLOUDFLARE_ACCOUNT_ID=$(doppler secrets get CLOUDFLARE_ACCOUNT_ID --project hauck-command-center --config prd --plain) CLOUDFLARE_API_TOKEN=$(doppler secrets get CLOUDFLARE_API_TOKEN --project hauck-command-center --config prd --plain)
   npx wrangler pages deploy agency/briefs/public --project-name hauck-briefs --branch main --commit-dirty=true
   curl -sL https://brief.hauckmarketing.com/<slug>/ | grep -o "<h1>[^<]*</h1>"
   ```
9. **Commit** `agency/briefs/src/<slug>/` + `agency/briefs/public/<slug>/` and push. Give Jake the link plus a numbered pre-call checklist.

## Capturing creatives (Claude in Chrome)

1. Open the Ad Library link in a new MCP tab.
2. Read cards with `javascript_tool`: find `span` matching `/^Library ID: \d+/`, walk up to the parent whose `innerText` includes "Sponsored"; body text = text after "Sponsored". Note `video` presence and "Started running on".
3. Pull primary text **one ad per call** and slice to ~600 chars per call (tool output truncates around 1,000 chars).
4. Show creatives full size: append a fixed white overlay `div` with `new Image()` using the card's `img.src` (or `video.poster`) at width 600px, then read `getBoundingClientRect()`.
5. Convert CSS px to screenshot px: multiply by `1568 / innerWidth` (screenshot frame is 1568 wide). `computer` → `zoom` with that region and `save_to_disk: true`.
6. Convert to JPEG for size: `ffmpeg -loglevel error -y -i in.png -q:v 3 out.jpg` into `creatives/`.
7. Close the tab.

## Gotchas

- `javascript_tool` returns `[BLOCKED: Cookie/query string data]` if the result contains URLs with query strings (every fbcdn image URL). Never return `src` values; use them in-page only.
- Two ads with identical creative + text: show once.
- A second `zoom` right after the first can time out (renderer busy). Take a plain screenshot to confirm instead of retrying blindly.
- hauckmarketing.com DNS is at Namecheap (no API). `brief` CNAME → `hauck-briefs.pages.dev` is a one-time setup; Jake must be logged in for Claude to do it in Chrome. Until then use https://hauck-briefs.pages.dev/<slug>/.
- The Artifact preview wraps the fragment in its own skeleton; the public page gets doctype, noindex and `body { margin: 0 }` from `build.py`. Edit `brief.html` only, never the built files.
- `.chart` must close its `</div>` before `</section>`.
