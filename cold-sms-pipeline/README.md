# Cold SMS pipeline

Google Maps, filtered and checked, into a CSV for GHL. GHL sends the texts.
Standalone: nothing here touches the app, Supabase, or the old `command-center/lead-scraper`.

## Run it

From this folder:

```
python run.py scrape                       every queued city x keyword, resumes where it stopped
python run.py status
doppler run --project hauck-command-center --config prd -- python run.py lookup
python run.py export                       out/hvac_<date>.csv (+ _skipped.csv with reasons)
```

- `scrape --state MI --max-queries 30` for a slice.
- `lookup --max 500` caps Twilio spend (about $0.008 a number). Out of credit = it stops, keeps what it checked, resume later.
- `export --dry-run` writes the CSV without marking anyone as exported.
- `test-csv --phone 2485550134` writes a CSV of your own numbers with a made-up shop, for the test send.
- `reprocess` re-judges every stored lead after a change to `config/hvac.json`. Twilio answers are kept.
- `python -m unittest discover -s tests -t .` runs the tests.

## What decides a lead

All in `config/hvac.json`:

- **Kept:** Google's primary category is an HVAC one, or it is a plumber/mechanical shop whose name says heating or cooling and that lists an HVAC category somewhere.
- **Dropped:** franchises and supply houses, names saying supply/parts/commercial/duct cleaning, more than 1,500 reviews, anything outside MI/OH/IN/WI/IL.
- **service:** `boiler` or `heat pump` only when the NAME says so, otherwise `AC and furnace`.
- **Sent:** Twilio says `mobile`.

## GHL setup (once, Hauck sub-account)

1. Settings, Custom Fields: add a single-line text field named **service** (key `contact.service`).
2. Automation, Workflows, new workflow. Trigger: **Contact Tag** added, tag `cold-sms-hvac`.
3. Workflow settings: **Stop on response** on.
4. Add SMS 1, Wait, SMS 2, Wait, through SMS 5. Use the same copy as `config/messages.txt`.
5. On each SMS step (or the waits), set the send window to 8am to 9pm, contact's timezone.
6. Publish.

## Each batch

1. Contacts, Import, pick the CSV from `out/`.
2. Map: Company Name, Phone, City, State, Timezone, Website, Tags, and `service` to the custom field.
3. Import. The tag starts the workflow.
