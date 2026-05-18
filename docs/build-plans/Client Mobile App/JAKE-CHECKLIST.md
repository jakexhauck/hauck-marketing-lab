# Jake's Checklist — Phase 2 Setup

Everything you personally need to touch. Estimated 45–60 minutes hands-on. After step 17 you can step away; Claude does the rest. Last step (24) is a 5-min iPhone test once Claude pings you.

---

## A. Supabase (your account)

- [ ] **1.** Go to https://supabase.com, sign up or log in.
- [ ] **2.** Click **New project**. Fill in:
  - Name: `hauck-dashboard`
  - Database password: click "Generate" and save to your password manager
  - Region: pick the closest US region
  - Pricing plan: Free
- [ ] **3.** Wait ~2 minutes for the project to provision.
- [ ] **4.** Once it's up, click **Project Settings → API** (left sidebar). Copy these three values into a temporary note:
  ```
  A) Project URL  =  https://________.supabase.co
  B) anon public key  =  eyJ...
  C) service_role key  =  eyJ...   (treat like a password)
  ```
- [ ] **5.** Click **Authentication → Providers**. Confirm:
  - Email is **enabled**
  - "Confirm email" is **off** (magic-link doesn't need it)
  - Click Save if you changed anything.
- [ ] **6.** Click **Authentication → URL Configuration**. Set:
  - Site URL: `http://localhost:5173`
  - Add to "Redirect URLs" (one per line):
    - `http://localhost:5173/**`
    - `https://dash.hauckmarketing.com/**`
  - Save.
- [ ] **7.** Click **SQL Editor → New query**. Open the file `client-dashboard/supabase/migrations/0001_init.sql` on your computer, copy its entire contents, paste into the SQL editor, click **Run**. You should see "Success. No rows returned."
- [ ] **8.** Click **Authentication → Users → Add user → Create new user**. Email: `jdhauckmonetization@gmail.com`. Toggle "Auto Confirm User" **ON**. Click Create.

---

## B. GoHighLevel (Willis Windows sub-account)

- [ ] **9.** Log into your GHL agency dashboard. Click into the **Willis Windows** sub-account.
- [ ] **10.** Sub-Account Settings → **Private Integrations**. (Usually under the gear icon → "Integrations" or "Private Integrations". If you can't find it, search "private integrations" in GHL's top-right search.)
- [ ] **11.** Click **Create New Integration**. Name it `Hauck Dashboard`. Under Scopes, check all of these:
  - `contacts.readonly` and `contacts.write`
  - `opportunities.readonly` and `opportunities.write`
  - `conversations.readonly` and `conversations.write`
  - `conversations/message.readonly` and `conversations/message.write`
  - `locations.readonly`
  - `users.readonly`
  - `calendars.readonly`
- [ ] **12.** Click **Create**. **Copy the token immediately** — it's only shown once. Save to your temp note:
  ```
  D) GHL token  =  pit-... or eyJ...
  ```
- [ ] **13.** Get the **Location ID**: in the Willis sub-account, go to Settings → Business Profile, scroll to the bottom. Or copy it from the browser URL when you're in Willis (look for `locationId=` in the URL bar). Save to your temp note:
  ```
  E) GHL location ID  =  ____________________
  ```

---

## C. Cloudflare Pages (your account)

- [ ] **14.** Go to https://dash.cloudflare.com → **Workers & Pages** → **Create application** → **Pages** tab → **Connect to Git**.
- [ ] **15.** Authorize Cloudflare on the GitHub account that owns `jakexhauck/hauck-marketing-lab`. Select the repo.
- [ ] **16.** Build config — fill in **exactly**:
  - Project name: `hauck-dashboard`
  - Production branch: `main`
  - Framework preset: `None`
  - Build command: `corepack enable && pnpm install --frozen-lockfile && pnpm build`
  - Build output directory: `dist`
  - **Root directory (advanced) — open the section, set to:** `client-dashboard`
  - Environment variables — add these now (you'll add more later):
    - `NODE_VERSION` = `20`
    - `PNPM_VERSION` = `9`
- [ ] **17.** Click **Save and Deploy**. First build takes ~2 min. When it finishes, confirm the `*.pages.dev` URL (shown on the project page) loads the current mock-data login screen. Save it to your note:
  ```
  F) .pages.dev URL  =  hauck-dashboard.pages.dev   (or similar)
  ```

---

## D. Custom domain (Cloudflare → Namecheap)

- [ ] **18.** In the Pages project page, click **Custom domains → Set up a custom domain**. Enter `dash.hauckmarketing.com`. Cloudflare will show "DNS not on Cloudflare" and give you a CNAME target. Copy it.
- [ ] **19.** New tab → log into Namecheap → Domain List → `hauckmarketing.com` → **Manage** → **Advanced DNS** tab.
- [ ] **20.** Click **Add New Record**:
  - Type: `CNAME Record`
  - Host: `dash`
  - Value: paste what Cloudflare showed you in step 18
  - TTL: `Automatic`
  - Save.
- [ ] **21.** Back in Cloudflare Pages, click **Check DNS** (or wait — refresh after 2 min). SSL provisions within 5 min. Once it's green, open `https://dash.hauckmarketing.com` in your browser. Should serve the same login screen.

---

## E. Hand the credentials back to Claude

- [ ] **22.** Paste this block into chat, with your real values filled in:

  ```
  A) SUPABASE_URL = https://________.supabase.co
  B) SUPABASE_ANON_KEY = eyJ...
  C) SUPABASE_SERVICE_ROLE_KEY = eyJ...
  D) GHL_TOKEN = pit-... or eyJ...
  E) GHL_LOCATION_ID = ________________
  F) PAGES_HOSTNAME = hauck-dashboard.pages.dev
  ```

- [ ] **23.** Reply with one word: **"go."** That's my signal to start sections 02–06.

---

## F. What Claude does while you're away (no action required)

| Section | Time | Output |
|---|---|---|
| 02 | ~2h | Magic-link login wired to real Supabase. Sign in via your email → land on dashboard. Willis Windows brand applied. |
| 03 | ~3h | All `/api/*` Pages Functions live. Reading real Willis opportunities from GHL, marking Won writes back, conversation thread pulls real SMS. |
| 04 | ~2.5h | Frontend swapped from mock data to real API. Pipeline mirrors Willis' GHL stages dynamically. |
| 05 | ~1h | Tap to call any lead. Inline SMS thread on lead detail. Send SMS replies straight from the app. |
| 06 | ~2h | Web push notifications. New lead lands in GHL → your phone buzzes within seconds. Tap → opens the lead. |

Total: ~10–11h of focused work, compressed via parallel coding + sequential commits. Each section ends with a git commit and an auto-redeploy of `dash.hauckmarketing.com`.

---

## G. The final 5-min iPhone test (when Claude pings you)

- [ ] **24.** Claude will message you when section 06 is done. Then:
  1. On your iPhone, open `https://dash.hauckmarketing.com` in Safari (not Chrome — iOS push needs Safari for the PWA install).
  2. Share → Add to Home Screen → Add.
  3. Open the app from your home screen icon.
  4. Sign in with your email. Open the magic-link email on your phone, tap the link.
  5. You should see real Willis Windows leads. Tap one. Tap the phone icon → dialer should open. Tap "SMS" → send a test message. Mark a test lead "Won" → confirm modal → submit. Open GHL on your laptop — that opportunity should be Won there too.
  6. Allow push notifications when prompted. Then have someone fill out the Willis lead form (or manually create a contact in GHL) — your phone should buzz within ~10 seconds.

If all six pass, the app is sellable. Phase 2 done.

---

## Stuck? Common issues

- **Supabase magic-link email not arriving:** check spam. Supabase's default sender is fine for testing, but it can lag 30–60s. If still nothing after 5 min, check Supabase → Authentication → Logs.
- **Cloudflare build fails:** most common cause is the Root directory wasn't set to `client-dashboard`. Check step 16.
- **`dash.hauckmarketing.com` shows SSL error:** SSL provisioning isn't instant. Give it 5 minutes after the CNAME is added. If still broken after 10, the CNAME value at Namecheap is wrong.
- **GHL says "no scopes available":** you're on the wrong account level. Make sure you're inside the Willis Windows sub-account, not the agency-level dashboard.
- **GHL token doesn't work:** verify it starts with `pit-` (Private Integration) and not `eyJ` (an OAuth token from a different flow). Either should work, but `pit-` is what we expect.
