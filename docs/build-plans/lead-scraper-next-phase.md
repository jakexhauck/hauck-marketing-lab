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
| Do-not-contact list | empty, and now one command to add to (2026-08-21) |

The honest read: the scraper is precise but small. Seattle windows and doors is close to exhausted at roughly 45 leads, and at 3.5 minutes a query, volume is a time problem before it is anything else.

---

## A. The landline rule - DECIDED 2026-08-21: mobile only everywhere

Jake's call, against the recommendation on this page: SMS, the CSV export and the
power dialer all stay mobile-only. The ~94 qualified landlines stay out of
circulation, and the reasoning in `leadScraper.ts` stands as written. Nothing was
built; the code already behaved this way. Do not re-open without new evidence, and
section C is the evidence that would do it.

---

## B. Finish the stranded run — 🔵 Jake, then 🟢 me

Nothing is blocking this. The run is `queued` and resumes where it stood.

1. From `command-center/lead-scraper`, run `bash run.sh --watch`.
2. It picks up run `d19dc69b` at query 41 and works Issaquah, Kirkland, Mercer Island, Redmond, Sammamish and Vancouver.
3. Budget roughly **3.5 hours** of wall time. Leave it running; it saves after every batch and survives a stop.

Expected: about **27 more dialable leads**. Section A was decided mobile-only, so that is the whole number, not a floor.

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

## E. Guardrails - BUILT 2026-08-21

**E1, E2 and E3 are done and on main.** What shipped:

- **The do-not-contact list has a way in.** `python suppress.py +1...`, `--file`,
  `--list`, `--sync`. It writes the file the CSV exporter reads AND stamps
  `send_status=do_not_contact` on the row, which is what the app, both send paths
  and the dialer read. Written over any status, including a number already sent.
  A ticked lead refused for being on the list now says so instead of claiming it
  had already gone out. Two bugs found on the way: the first entry ever added would
  have deleted the file's own header, and a typo was stored rather than refused.
- **A run reports what can be rung.** `passed_count` and `sendable_count` on
  `scrape_runs` (mig 0116), a Can send column in Leads history, and the line under
  a run's status now reads the send rate. Directory-fallback leads were also being
  saved with no `line_type` at all, so every one of them was unsendable until a
  backfill happened to run; they are checked the same way as the Maps path now.
- **`hvac_softdelete_undo.json` is gone**, and its .gitignore line with it.

**E4 (the seeding trap) is unchanged and still true:** editing `niches/*.json` does
not reach the wizard until `node ../app/scripts/seed-niches.mjs` runs, and the seed
never prunes. Read the table back after any trade change rather than trusting the file.

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

1. **C** - call the leads you already have. Everything else is better decided afterwards.
2. **B** - start the runner, so the next 27 exist by morning.
3. **D1** - measure concurrency, then **D2** with what section C taught you.
4. **F** - decide the no-website penalty, once C says whether those businesses answer.

A is decided and E is built.
