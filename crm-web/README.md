# crm-web — Hauck CRM (web)

The desktop web CRM. A "Console" operations cockpit over the same GoHighLevel +
Supabase backend the mobile PWA uses. Single tenant, shared-password auth, built
so a future Tauri desktop wrap is a thin layer (the backend already accepts a
bearer token in addition to the cookie).

Part of the repo-root pnpm workspace (`crm-web` + `packages/core`). The mobile app
(`client-dashboard/`) and agency app (`app/`) are standalone and untouched.

## Architecture

- **React 19 + Vite + TypeScript + Tailwind v4** (CSS-first tokens), React Query v5,
  react-router v7, lucide-react.
- **`@hauck/core`** (`packages/core`) holds the API types and the transport-agnostic
  fetch client. The web app builds it in **cookie mode**; a desktop app would build
  it in **bearer mode**.
- **No backend of its own.** All `/api/*` calls go to the mobile project's API
  (`dash.hauckmarketing.com` in prod, the local Wrangler server in dev).

## Run it locally

Two terminals from the repo root.

**1) Backend (the Cloudflare functions, same one the mobile app uses):**

```
cd client-dashboard
pnpm install            # first time
pnpm build              # produces dist/ so wrangler can serve functions
npx wrangler pages dev dist --port 8788 --compatibility-flags nodejs_compat
```

Wrangler auto-loads `client-dashboard/.dev.vars` (your GHL + Supabase secrets).

**2) Web CRM:**

```
pnpm install            # first time, from repo root
pnpm --filter crm-web dev
```

Open http://localhost:5174 and sign in with your `APP_PASSWORD` (or the test
account via the toggle, using `TEST_APP_PASSWORD`). The Vite dev server proxies
`/api` to the backend on 8788, so cookies work same-origin.

## Scripts

- `pnpm --filter crm-web dev` — dev server on 5174.
- `pnpm --filter crm-web typecheck` — `tsc --noEmit`.
- `pnpm --filter crm-web build` — production build to `crm-web/dist/`.

## Surfaces

Overview (live pipeline ribbon + pulse), Pipeline (kanban + table + lead drawer),
Inbox (conversations), Contacts, Calendar (agenda), Billing (invoices + payments),
Activity (notification center). Global command palette on Cmd-K.

## Deploy

See `docs/build-plans/Unified CRM/MANUAL-ACTIONS.md`. In short: a separate
Cloudflare Pages project, build command `pnpm --filter crm-web build`, output
`crm-web/dist`, env `VITE_API_BASE=https://dash.hauckmarketing.com`, custom domain
`crm.hauckmarketing.com`. The backend auth change must be deployed first.
