# Hauck Internal — SOP Hub

Internal agency portal at **internal.hauckmarketing.com**. Phase 1 is the SOP
library: a gated, branded list of every SOP, each opening to written steps + the
original training video. Admin-only, reusing the Command Center login.

## Layout

```
intranet/
  site/                 static site (served by Cloudflare Pages)
    index.html          home — category list of SOPs (+ live search)
    sop.html            SOP detail (steps + video), ?cat=&slug=
    login.html          admin sign-in (Command Center credentials)
    data.js             SOP seed data (phase 2: swap for the Supabase API)
    app.css             shared styles (brand green on dark)
    logo.png            transparent wordmark
  functions/            Cloudflare Pages Functions
    _middleware.ts      gates the whole site behind the admin session
    api/auth/           admin-login, me, logout
    lib/                session, password, supabase, env (mirrors Command Center)
```

## Auth model

Same as the Command Center super-admin login: email + password checked against
the shared Supabase `admin_accounts` table (PBKDF2), minting an HMAC-signed
`hml_session` cookie. The cookie is scoped to this host, so an admin signs in
here once with their existing credentials. Set the SAME `SESSION_SECRET`,
`SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` as the Command Center.

## Local dev

```
cd intranet
npm install
cp .dev.vars.example .dev.vars   # fill in the three secrets
npm run dev                       # http://localhost:8799
```

To preview just the UI without auth, serve `site/` statically (e.g.
`python -m http.server` inside `site/`); the Functions gate only runs under
`wrangler`.

## Deploy

```
npm run deploy            # wrangler pages deploy → project "hauck-internal"
```

Then in Cloudflare:
1. Set env vars `SESSION_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
2. Add custom domain `internal.hauckmarketing.com`.
3. At Namecheap, add a CNAME `internal` → the Pages `*.pages.dev` target.

## Roadmap

- Phase 2: move SOPs from `data.js` to a Supabase table + an admin editor
  (add / edit), with per-SOP video links generated via the `/watch` skill.
- Later: more internal sections (assets, employee onboarding), employee
  (non-admin) logins.
