# Lead Scraper: The Next Phase

> Follow-up to the qualifier fix shipped on `main` (`d4fb8e45`, `7d209bf2`, `e31c94d5`, 2026-08-20). The scraper is armed, correct and proven end to end: a fresh scrape produced 4 leads, all four genuine window and door installers. What is LEFT is turning a correct scraper into a list worth working, and the first thing in the way is a decision, not a build.

Status legend: 🟢 mine, do anytime · 🟡 needs a Jake decision first · 🔵 Jake action.

---

## Where things actually stand

Measured, not estimated. All figures from the live table and today's run.

| | |
| --- | --- |
| Leads in the table | 948 |
| Dialable today (windows and doors) | 15 |
| Dialable today (home services) | 33 |
| Qualified leads blocked for being landlines | 94 |
| Stranded run | 40 of 100 queries done, 6 WA cities left |
| Throughput, measured | ~3.5 min per query at depth 10, concurrency 4 |
| Yield, measured | ~0.45 dialable leads per query |
| Google pushback | `failure_rate` 0.026 to 0.051, against a 0.20 threshold |
| Do-not-contact list | **empty** |

The honest read: the scraper is precise but small. Seattle windows and doors is close to exhausted at roughly 45 leads, and at 3.5 minutes a query, volume is a time problem before it is anything else.

---

## A. The landline rule is costing about two thirds of the list — 🟡 decision, then 🟢 build

**What's true today:** every send path refuses anything that is not `wireless`. The rule is deliberate and the reasoning is written down in `command-center/app/functions/lib/leadScraper.ts`:

> Landline is a refusal, not a demotion. A cold list is worth having because the number rings in somebody's pocket, and a business's published main line rings on a desk nobody is sitting at.

That reasoning is sound for SMS. It is much weaker for the power dialer, because a business's main line is the number a business answers on purpose.

**The size of it:** across the two live trades, 94 qualified leads are blocked as landlines against 48 that are dialable. The rule is throwing away roughly two out of every three qualified businesses.

**A second reason to look again:** the line type comes from NANPA's free block data. It is block-level, blind to porting, and about 70 to 80% right by its own README. A number ported from a landline to somebody's mobile still reads as a landline. So the blocked pile already contains real mobiles.

**Decision needed:**

- **Option 1 (recommended): split the rule by channel.** SMS and the CSV export stay mobile-only, because deliverability and the regulations both care. The power dialer accepts landlines. Roughly triples the callable list overnight with no extra scraping.
- **Option 2: leave it as it is.** Fewer, better-targeted conversations; the current constraint stands.
- **Option 3: drop line type from the send rules entirely** and let the dialer sort it out. Cheapest to build, worst for SMS.

**If Option 1, the build (🟢, about an hour):**

- `functions/lib/leadScraper.ts`: give `partitionForSend` a `channel: "sms" | "voice"` parameter, defaulting to `"sms"` so nothing changes by accident. The landline branch applies only when `channel === "sms"`.
- `functions/api/admin/cold-call/power-dialer.ts:101` and `bridge.ts:86`: pass `"voice"`, drop the `isMobile` filter.
- `functions/api/admin/leads/index.ts:120-128`: the "Ready to send" filter's `.eq("line_type","wireless")` becomes conditional on the same channel.
- `export_sms.py` `clean()` is unchanged. It is the SMS path and mobile-only is correct there.
- Tests first, in `leadScraper.test.ts`: a landline is rejected on `"sms"`, accepted on `"voice"`, and `unknown` stays rejected on both (those rows are toll-free and out-of-country).
- Release note entry in the same commit, per the standing rule.

---

## B. Finish the stranded run — 🔵 Jake, then 🟢 me

Nothing is blocking this. The run is `queued` and resumes where it stood.

1. From `command-center/lead-scraper`, run `bash run.sh --watch`.
2. It picks up run `d19dc69b` at query 41 and works Issaquah, Kirkland, Mercer Island, Redmond, Sammamish and Vancouver.
3. Budget roughly **3.5 hours** of wall time. Leave it running; it saves after every batch and survives a stop.

Expected: about **27 more dialable leads**, or about **70** if Option 1 in section A lands first.

When it finishes I will check the run summary, confirm `failure_rate` stayed under 0.20, and regrade.

---

## C. Nobody has actually called one of these leads — 🔵 Jake

**This is the most important item on the page and it is not a build.**

The qualifier is now provably precise on paper: 3,124 raw records down to 41 that pass, every one a genuine window or door business. What that precision is worth is unknown, because not one of these leads has been rung.

1. Take the 15 dialable windows and doors leads to the power dialer.
2. Call them. All fifteen.
3. Tell me three things: how many were the right kind of business, how many answered, and how many were worth a second call.

That tells us whether the gate at 50 is in the right place, whether the trade separation is real, and whether "no website" is the buying signal it looks like. Everything in section D and F is guesswork until this happens.

---

## D. Volume: the arithmetic, and the two ways out — 🟡 decision

**The universe:** `data/metros.json` holds 69 metros and 344 suburbs. Windows and doors has 10 keywords. A full national sweep of one trade is roughly **4,130 queries**, which at the measured 3.5 minutes each is about **240 hours of scraping**. That is ten days of a machine running flat out, for one trade.

So national-by-brute-force is not a plan. Two things make it tractable, and they compose:

**D1. Go faster (🟢, half a day, needs measuring not guessing).** Concurrency is 4 and Google's pushback is sitting at 0.03 against a threshold of 0.20. There is real headroom. The work: run the same 10-query batch at `-c 4`, `-c 8` and `-c 12`, record `failure_rate` and wall time for each, and raise the default only as far as the measurements support. If 8 holds, ten days becomes five. `coordinator.py` already backs off on its own if it is wrong, so the downside is bounded.

**D2. Go narrower (🟡 Jake's call).** 4,130 queries assumes every suburb of every metro. It is almost certainly the wrong shape. Which of these is the business?

- **Local:** one metro at a time, all six trades. About 60 queries a metro per trade, so a metro is a day. Good if you want density in one market and referenceable local case studies.
- **National, top metros only:** tier-1 anchors, no suburb rings, one trade. Roughly 250 queries, about 15 hours. Good if the offer travels and you want reach fast.
- **National, one trade, everything:** the ten-day version. Only worth it once a trade is proven to convert.

**My recommendation:** do not choose yet. Section C answers it. If cold calls convert on windows and doors, go national on windows and doors. If they do not, the problem is the offer or the trade, and more leads would only have burned more numbers.

---

## E. Guardrails to fix before volume, not after — 🟢 mine

Small, cheap, and each one is the sort of thing that is obvious in hindsight.

**E1. The do-not-contact list is empty.** `data/suppression.txt` has four comment lines and no numbers. The moment somebody asks not to be contacted, that has to be a one-command operation and it has to be permanent. `suppress.merge_suppressed()` exists and is tested; nothing calls it from anywhere a human would reach. Build: a `python suppress.py +1555...` entry point, and wire the app's own opt-out path into the same file so the CSV export and the dialer honour one list.

**E2. The run summary reports the wrong thing.** `coordinator.Progress.pass_rate` is `kept / raw`, and since the fix `kept` is much closer to "actually qualified", so the number is now roughly honest by accident. Make it deliberate: report `passed / raw` alongside `kept / raw`, so a run says how many leads it can actually send, not how many rows it stored.

**E3. `hvac_softdelete_undo.json` is a lie sitting in the repo folder.** It claims 129 leads were deleted via a `deleted_at` column that does not exist on the table. It is gitignored so it never shipped, but it is waiting to mislead the next person who reads it. Delete it once you are happy with the HVAC retirement; the real undo is `data/retire_hvac_undo.json`.

**E4. Adding a trade still has the seeding trap.** Editing `niches/*.json` does not reach the wizard until `node ../app/scripts/seed-niches.mjs` runs, and the seed never prunes. Already documented in the README; it will bite on the first new trade regardless, so I will run the seed and read the table back as part of any trade change rather than trusting the file.

---

## F. The no-website penalty, corrected — 🟡 small decision

I told you earlier that a window installer with no website "cannot be texted". That was only half right, and the half I got wrong matters.

**What's true:** a business with no website, no rating and no reviews loses 15 points, which drops a real window installer like `kitsap windows` from 55 to 40. The CSV/SMS export gates at 50, so it is not exportable. **The app's power dialer does not gate on score at all** — that was removed deliberately, and the reason is in the code: the score was rejecting 18 of every 23 qualified window firms while the screen still offered them to be ticked.

So those businesses are already callable. They are only unreachable by SMS.

**The decision:** for an agency selling marketing, a contractor with no website is arguably the best prospect on the list, not the worst. Either:

- **Leave it.** The penalty is really a dead-listing detector, and a listing with no website, no rating and no reviews often is dead.
- **Make it conditional (🟢, 20 minutes):** skip the penalty when a core category matched, so Google-confirmed tradesmen keep their score and only genuinely empty listings are punished. Pinned with a test either way.

Worth deciding after section C, when you know whether those businesses answer the phone.

---

## Suggested order

1. **C** — call the 15 leads you already have. Everything else is better decided afterwards.
2. **B** — start the runner tonight, so the next 27 exist by morning.
3. **A** — decide the landline question. Highest single return of anything here.
4. **E1** — the suppression entry point, before any volume.
5. **D1** — measure concurrency, then **D2** with what section C taught you.
