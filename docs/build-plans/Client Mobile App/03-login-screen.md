# Section 03: Login Screen

## Goal

Build a branded login screen with an email input and a "Send magic link" button. In Phase 1 the button does not actually send anything, clicking submits the form and routes straight to `/dashboard`. The screen exists to demo the entry experience and the per-client branding.

## Depends on

Section 01 (scaffold), Section 02 (mock data, need a client/brand to show).

## Acceptance criteria

- Visiting `/login` renders a centered card on mobile width with: client logo (or initials), `appName` heading, email input, button labeled "Send sign-in link"
- Brand color from the currently-selected mock client paints the button background and accents
- Submitting the form (or clicking the button) navigates to `/dashboard` immediately, no loading state, no network call
- A subtle dev-mode hint below the form: small grey text reading "Demo mode, any email signs you in"
- Input is type=email with required validation, but the validation can pass on any non-empty string
- Visiting `/` redirects to `/login` if no user is in context, `/dashboard` if there is one (simple in-memory `AuthContext`)
- After "login", a `currentUser` is set on the context with a default user (the Owner of the active mock client). Section 07 will let the user switch role.
- Layout is mobile-first, looks correct at 375px and 414px
- `pnpm typecheck` passes

## Files created / modified

```
client-dashboard/src/
  context/
    AuthContext.tsx       (provider + useAuth hook)
    ClientContext.tsx     (provider + useClient hook, current client + brand)
  routes/
    Login.tsx             (real implementation, replaces placeholder)
  components/
    BrandedButton.tsx     (button that uses --brand-primary)
    BrandedLogo.tsx       (img or initials fallback)
  App.tsx                  (wrap routes in <AuthProvider> + <ClientProvider>)
```

## Steps

1. Build `ClientContext`, holds the active `Client` object, defaults to `smiths-roofing`. Sets brand CSS variables on `:root` whenever the client changes. Section 08 will add a client picker; for now it's a static default.
2. Build `AuthContext`, holds `currentUser: User | null`, exposes `signIn(email: string)` which picks the Owner of the active client and sets it. Exposes `signOut()` for completeness.
3. Build `BrandedButton` and `BrandedLogo`, they read from `useClient()`.
4. Implement `Login.tsx`:
   - Centered card, white surface, ~24px padding, rounded corners
   - Logo (top), app name (h1, sans-serif 600), tagline ("Your leads, your pipeline")
   - Email input, then `BrandedButton`
   - On submit: call `signIn(email)`, navigate to `/dashboard`
   - Dev-mode hint text below the button
5. Wire route guard in `App.tsx`, if no current user, redirect protected routes to `/login`. Use a simple `<ProtectedRoute>` wrapper.
6. Verify on the dev server at 375px that nothing overflows or looks broken

## Stop condition

Commit when you can load `/`, see the branded login, type any email, click the button, and land on `/dashboard` with a user in context.

**Commit message:** `client-dashboard: branded login screen with fake magic-link auth (section 03)`

## Token weight

Light. Three small components plus two contexts. Mostly straightforward.

## Notes

- The "magic link" framing is set now because Phase 2 will replace this with a real Supabase magic-link flow. UI stays identical; the `signIn()` implementation swaps.
- Resist the urge to add a password field, OAuth buttons, or any other auth flourish. Magic link is the locked auth pattern.
- The dev-mode hint text gets removed (or hidden behind a flag) in Section 10 before deploy. Don't ship that to production.
- Keep the login screen tiny. It's not the product. The product is the dashboard.
