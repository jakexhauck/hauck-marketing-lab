# Section 01: Scaffold

## Goal

Stand up the empty Vite + React + TS + Tailwind v4 + React Router project at `client-dashboard/`, wire the mobile-first shell layout, and confirm it boots cleanly at `localhost:5173`.

## Depends on

Nothing.

## Acceptance criteria

- `pnpm install` and `pnpm dev` work inside `client-dashboard/` with no warnings or errors
- Page loads at `localhost:5173` showing a placeholder "Hauck Dashboard" header inside a mobile-width centered container
- Viewport meta tag set for mobile (`width=device-width, initial-scale=1, viewport-fit=cover`)
- Tailwind v4 working, confirm with a `bg-slate-900 text-white` test class on the body
- React Router installed with `/login`, `/dashboard`, `/lead/:id` routes registered (rendering placeholder components, no real UI yet)
- Brand tokens declared as CSS custom properties on `:root` (e.g. `--brand-primary`, `--brand-fg`, `--brand-bg`) with sensible defaults, Section 08 will swap these
- `pnpm typecheck` passes
- `pnpm build` produces a `dist/` folder

## Files created

```
client-dashboard/
  package.json
  pnpm-lock.yaml
  tsconfig.json
  tsconfig.node.json
  vite.config.ts
  index.html
  .gitignore
  src/
    main.tsx
    App.tsx
    index.css        (Tailwind directives + :root brand tokens)
    routes/
      Login.tsx      (placeholder)
      Dashboard.tsx  (placeholder)
      LeadDetail.tsx (placeholder)
    components/
      Shell.tsx      (mobile-width container, optional top bar)
```

## Steps

1. From repo root, `mkdir client-dashboard` and `cd client-dashboard`
2. `pnpm create vite@latest . --template react-ts` (accept all defaults)
3. Add Tailwind v4: `pnpm add -D tailwindcss @tailwindcss/vite`, wire `@tailwindcss/vite` plugin in `vite.config.ts`, add `@import "tailwindcss";` to `index.css`
4. Add React Router: `pnpm add react-router-dom`
5. Add `clsx` and `tailwind-merge` (match HML's utility set), Section 04+ will need them
6. Rewrite `src/App.tsx` with `BrowserRouter` + the three routes pointing to placeholder components
7. Build `src/components/Shell.tsx`, a `max-w-md mx-auto min-h-dvh` container with safe-area padding (`pt-[env(safe-area-inset-top)]` etc.)
8. Add `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` to `index.html`
9. Drop test classes on the placeholder dashboard to confirm Tailwind is live
10. Run `pnpm dev` and `pnpm build` to confirm both work

## Stop condition

Commit when `pnpm dev` shows the placeholder dashboard at `localhost:5173` and `pnpm build` succeeds.

**Commit message:** `client-dashboard: scaffold Vite + React + TS + Tailwind v4 + Router (section 01)`

## Token weight

Light. Mostly boilerplate the tools generate. Mostly file creation, light reasoning.

## Notes / pitfalls

- Tailwind v4 setup is different from v3, no `tailwind.config.js` by default, config is CSS-based via `@theme` directive
- Keep the placeholder components dead simple. No styling effort here, just route stubs. Section 04 builds the real lead list.
- Do **not** install Supabase, GHL SDK, or any auth library in this section. Phase 1 is frontend-only.
