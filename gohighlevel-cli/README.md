# GoHighLevel CLI

A command-line interface for GoHighLevel that lets you (or Claude Code) drive your CRM from the terminal — contacts, opportunities, calendars, conversations, workflows, emails, payments, forms, social media, locations, and documents.

Built by [Lead Gen Jay](https://leadgenjay.com).

---

## What you get

- **11 command groups** covering the full GHL surface (contacts, opportunities, calendars, workflows, conversations, emails, payments, forms, social, locations, documents).
- **A REPL** — type `ghl` with no args and you get an interactive shell with autocomplete.
- **Workflow builders** — Python scripts that take a markdown file and turn it into a live GHL workflow (see `builders/`).
- **A one-line token helper** — a DevTools console snippet that exports the Firebase token you need for the "internal" GHL API (the public API can't create workflows; the internal one can). See [`docs/get-firebase-token.md`](docs/get-firebase-token.md).
- **A Claude Code skill** at `cli_anything/gohighlevel/skills/SKILL.md` so Claude can use the CLI on your behalf.

---

## Install (60 seconds)

Requirements: **Python 3.10+** and a GoHighLevel sub-account.

```bash
git clone <this repo> gohighlevel-cli
cd gohighlevel-cli
./install.sh
```

The installer creates a `.venv/`, installs the package, and copies `.env.example` → `.env`.

Open `.env` and fill in:

```env
GHL_API_KEY=pit-xxxxxxxx-...        # GHL Settings → Private Integrations
GHL_LOCATION_ID=YOUR_LOCATION_ID    # the long ID in your GHL URL
```

Smoke test:

```bash
./ghl contacts list --limit 5
```

You should see 5 contacts (or an empty list, depending on the account). Done.

---

## Quickstart examples

```bash
# Contacts
./ghl contacts search --query "jay@"
./ghl contacts create --first-name Jay --last-name Test --email jay@test.com
./ghl contacts tags add --contact-id <id> --tag consulti_trial

# Workflows
./ghl --json workflows list
./ghl workflows enroll --contact-id <id> --workflow-id <id>

# Workflow internals (need --experimental: internal API)
./ghl --experimental workflows drafts          # status + version for every workflow, incl. drafts
./ghl --experimental workflows show --workflow-id <id>   # full step/trigger dump

# Media storage
./ghl media list --limit 50
./ghl media upload --path ./flyer.pdf --name "Summer Flyer"
./ghl media delete --file-id <id>

# Opportunities
./ghl opportunities list --pipeline-id <id>

# Conversations
./ghl conversations list --contact-id <id>

# REPL (no args = interactive shell with autocomplete)
./ghl
```

`--json` works on most read commands and pipes cleanly into `jq`.

---

## Workflow building (the powerful part)

The public GHL API is read-only for workflows. To **create or update** workflows, the CLI uses GHL's internal API — and that needs a Firebase refresh token.

### Step 1 — grab the token

Open `app.gohighlevel.com` (logged in), open DevTools (**⌘⌥J** / **Ctrl-Shift-J**), and paste this into the Console:

```js
(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open("firebaseLocalStorageDb");
    r.onsuccess = e => res(e.target.result);
    r.onerror = () => rej("Cannot open IndexedDB");
  });
  const entries = await new Promise((res, rej) => {
    const tx = db.transaction("firebaseLocalStorage", "readonly");
    const all = tx.objectStore("firebaseLocalStorage").getAll();
    all.onsuccess = () => res(all.result);
    all.onerror = () => rej("Failed to read store");
  });
  for (const e of entries) {
    const stm = (e?.value || e)?.stsTokenManager;
    if (stm?.refreshToken) {
      copy(stm.refreshToken); // DevTools copy() → clipboard
      console.log("✓ Refresh token copied. Paste into .env as GHL_FIREBASE_REFRESH_TOKEN=");
      return;
    }
  }
  console.warn("No refresh token found — make sure you're logged into GHL.");
})();
```

It copies your refresh token to the clipboard. Paste it into your `.env` as `GHL_FIREBASE_REFRESH_TOKEN=...`. Full walkthrough: [`docs/get-firebase-token.md`](docs/get-firebase-token.md).

### Step 2 — build a workflow

`builders/` has example builders that turn a markdown email-sequence doc into a live workflow:

```bash
# Course Interest sequence (10 emails, 14 days)
python builders/wf1-course-interest-builder.py

# High Ticket Interest sequence (5 emails + 1 SMS)
python builders/wf5-ht-interest-builder.py

# Post-Call Sales (3 tag-triggered branch workflows)
python builders/wf6-post-call-sales-builder.py

# Consulti free-trial nurture (8 emails)
python builders/consulti-nurture-builder.py

# Post-purchase nurture (6 emails)
python builders/post-purchase-nurture-builder.py
```

Each builder supports `--update` to re-deploy without creating a duplicate workflow.

---

## Project layout

```
gohighlevel-cli/
├── ghl                         # the executable wrapper
├── setup.py                    # package definition
├── install.sh                  # one-shot installer
├── .env.example                # template for your secrets
│
├── cli_anything/               # the actual Python package
│   ├── gohighlevel/            # GHL commands (the main thing)
│   │   ├── gohighlevel_cli.py  # ~1,260 lines of CLI
│   │   ├── utils/              # API clients (public + internal + workflow builder)
│   │   └── skills/SKILL.md     # Claude Code skill manifest
│   ├── nextcloud/              # bonus: Nextcloud CLI
│   └── blotato/                # bonus: Blotato CLI
│
├── docs/
│   └── get-firebase-token.md   # DevTools snippet for the internal-API token
│
└── builders/                   # example workflow builders
    ├── wf1-course-interest-builder.py
    ├── wf5-ht-interest-builder.py
    ├── wf6-post-call-sales-builder.py
    ├── consulti-nurture-builder.py
    ├── post-purchase-nurture-builder.py
    ├── email-sequences-doc-builder.py
    └── _email_sequences_parser.py
```

---

## Using it with Claude Code

The repo includes a Claude Code skill so Claude can call the CLI on your behalf:

1. Copy `cli_anything/gohighlevel/skills/SKILL.md` into a Claude Code skills directory (e.g. `~/.claude/skills/gohighlevel-cli/SKILL.md`).
2. Add `ghl` to your shell's PATH (or symlink the `ghl` wrapper somewhere on PATH).
3. In any Claude Code session, say "use the gohighlevel-cli skill" and Claude will be able to run `ghl ...` for you.

---

## Two layers of GHL API

The CLI talks to two APIs:

| API | What it can do | How it authenticates |
|-----|----------------|----------------------|
| **Public** (`services.leadconnectorhq.com`) | Read everything, create contacts/opportunities/etc. **Workflows are GET-only here.** | `GHL_API_KEY` (Private Integration Token) |
| **Internal** (`backend.leadconnectorhq.com`) | Everything the GHL UI can do — including **creating workflows**. Hidden behind a `--experimental` flag on commands that use it. | Firebase JWT, refreshed from `GHL_FIREBASE_REFRESH_TOKEN` |

You only need the Firebase token if you want to **build** workflows. Everything else works with just the API key.

### Internal-API gotchas (learned the hard way)

- **Firebase rotates the refresh token on every exchange.** The CLI writes each rotated token back to `.env` automatically. If you copy `.env` elsewhere mid-session, re-sync it; an old token keeps working for a grace period, then dies.
- **Internal routes want a `version` header.** The client sends `2021-07-28`; without it, valid routes return a misleading `401 version header was not found`.
- **`services.leadconnectorhq.com` sits behind Cloudflare bot protection.** Plain urllib gets error 1010. Use `requests` (or any client that sends a browser User-Agent over a real TLS stack); PowerShell's `Invoke-WebRequest` also passes.
- **Media listing quirk:** `/medias/files` requires `altId`, `altType`, `sortBy`, and `type`. It accepts `type=all` but returns zero rows: use a concrete type (`file`, `image`, `video`, `audio`). Upload is multipart-only; JSON bodies get `UPLOAD_UNSUPPORTED_CONTENT_TYPE`.
- **Still closed, even internally:** funnel/website listing and appointment listing have no working route on either host as of 2026-08-23 (funnels list is a Firestore proxy that returns schema templates; appointments GET 404s). If you need these, capture the real request from DevTools on the GHL tab and extend from there.

---

## Security notes

- `.env` is gitignored. **Never** commit it.
- The Firebase refresh token is sensitive (it's your full GHL session). Treat it like a password.
- The token-grab snippet only **reads** from your own browser's IndexedDB on the GHL tab and uses the built-in DevTools `copy()` helper — it makes no network calls. See [`docs/get-firebase-token.md`](docs/get-firebase-token.md).

---

## License

Private / personal use.
