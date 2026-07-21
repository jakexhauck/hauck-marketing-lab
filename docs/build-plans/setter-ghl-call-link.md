# Setter Suite: call the lead from the GHL number

Spec + implementation plan. Branch `feat/setter-ghl-call` off `origin/main` (`3c0206b`).

## Why

A setter working the Setter Suite cockpit today sees the lead's phone number as a
`tel:` link. Tapping it dials from the setter's **own** handset, so the lead sees a
random personal mobile number instead of the client's business line. Answer rates
suffer and the call never lands in the client's CRM history.

The fix is to route the setter through the CRM's own dialer, which owns the business
number, the recording, and the call log.

## Why not something better

Three richer options were researched and rejected, recorded here so nobody
re-litigates them:

- **A "Call" button in our app that rings the lead directly.** Impossible on the CRM's
  phone system. There is no call-initiation endpoint; their Conversation Provider docs
  state that call providers "cannot be used to place or receive calls within the CRM"
  and exist only to log calls.
- **Deep link into the LeadConnector mobile app.** No URL scheme exists. The feature
  request has sat in "Planned" for over three years.
- **Embedding our board inside the CRM as a Custom Page.** Supported, and SSO is well
  documented, but an embedded iframe still has no way to drive the native dialer, and
  custom menu links do not render in the mobile app at all.

A dialer we control (Twilio or similar) is the only route to a true one-tap call.
Jake has ruled that out. This plan is the best available within that constraint.

## What we are building

In the lead cockpit header, the phone number stops being a `tel:` link and becomes a
link to the lead's CRM contact page, opened in a new tab. The setter clicks the phone
icon there and the softphone dials from the business number.

Two clicks, not one. There is no query parameter that opens the dialer pre-filled;
this was searched for specifically and does not exist.

### URL shape

```
https://app.gohighlevel.com/v2/location/{locationId}/contacts/detail/{contactId}
```

Plain vendor domain, per Jake. Acceptable here because the Setter Suite is an
internal, admin-gated surface worked by Hauck staff. The standing "never name the CRM
in client-facing UI" policy is not in play. If a white-label domain is adopted later,
this becomes a one-line change in a single pure function.

### Decisions locked in brainstorming

| Decision | Choice | Reason |
|---|---|---|
| Existing `tel:` link | **Replaced**, not kept alongside | Two call paths means a setter under pressure eventually dials from their personal number. One path cannot be got wrong. |
| Placement | **Cockpit only** | `SetterCard` is a single `<button>`; a nested button is invalid HTML and would force a refactor with keyboard/focus rework. The cockpit is also where `DialLogger` already lives, so calling and logging sit together. |
| Tab behaviour | **Named target**, reused | A dialing session otherwise leaves the setter with forty CRM tabs. |
| `DialLogger` auto-open | **Not applicable** | It is always rendered in the cockpit, never collapsed. The original open question dissolved on inspection. |

## Architecture

`locationId` currently exists server-side only, in `functions/lib/tenantGhl.ts:51`. It
must reach the browser.

It goes on the **existing** `/api/admin/setter/pipelines` response, which already
resolves the GHL context per tenant and is fetched once per client selection. No new
endpoint, no new query, no extra CRM round-trip.

The location ID is not a secret: it appears in plain URLs, and the route is admin-gated
regardless.

Data flow:

```
tenantGhl.ts (gctx.locationId)
  -> functions/api/admin/setter/pipelines.ts   { pipelines, locationId }
  -> useSetterPipelinesQuery
  -> SetterSuite.tsx                            pipelinesQuery.data?.locationId
  -> SetterCockpit.tsx  (new optional prop)
  -> ghlContactUrl(locationId, contactId)       -> <a href target rel>
```

### Edge cases

| Case | Behaviour |
|---|---|
| No phone on file | Unchanged: plain "No phone on file" text, no link |
| `locationId` missing or empty | Number renders as plain text, not a dead link |
| `contactId` empty | Same, plain text |

`ghlContactUrl` returns `null` for the last two, and the component branches on that.
A null return is the single source of "we cannot build a working link", so the
component never has to re-check the inputs itself.

## Tasks

### Task 1: `ghlContactUrl` in `src/lib/setterModel.ts`

Pure function, no I/O, alongside the existing model helpers.

```ts
export function ghlContactUrl(locationId: string, contactId: string): string | null
```

Returns the URL, or `null` if either argument is empty/whitespace.

Tests in `setterModel.test.ts`:
- builds the expected URL from a normal pair
- returns `null` for empty `locationId`
- returns `null` for empty `contactId`
- returns `null` for whitespace-only input
- URL-encodes both segments

### Task 2: expose `locationId` on the pipelines route

`functions/api/admin/setter/pipelines.ts`: add `locationId: gctx.locationId` to the
success response. One line plus the interface.

Test in `pipelines.test.ts`: response includes the tenant's own location ID, and the
existing placeholder-creds rejection path still returns before any CRM call.

### Task 3: thread the type through

`src/lib/api.ts`: add `locationId: string` to the setter pipelines response type near
the existing `ApiSetterPipeline` (line ~881).

### Task 4: pass it down

`src/routes/admin/SetterSuite.tsx`: read `pipelinesQuery.data?.locationId` and pass it
to `SetterCockpit` as a new optional prop.

### Task 5: swap the link in the cockpit

`src/components/admin/setter/SetterCockpit.tsx` header:

- accept `locationId?: string`
- compute `const crmUrl = ghlContactUrl(locationId ?? "", lead.contactId)`
- when `hasPhone && crmUrl`: render an `<a>` with `target="ghl-contact"`,
  `rel="noopener noreferrer"`, keeping the existing `Phone` icon and
  `formatPhone` output so the visual design does not change
- when `hasPhone && !crmUrl`: render the formatted number as a plain `<span>`
- remove the `tel:` branch and the now-unused `e164` import if nothing else uses it
- update the header comment, which currently says "identity + click-to-call", to state
  that calling goes through the CRM dialer and why

Component test: header renders an anchor whose `href` matches the CRM URL, and no
`tel:` href is present anywhere in the cockpit.

### Task 6: verify

- `npm test` green, no pre-existing failures introduced
- `npm run build` clean
- typecheck clean

## Out of scope

- Board-card phone icons (needs a `SetterCard` refactor; revisit if setters ask)
- Auto-logging outcomes via CRM Custom Dispositions + the Call Details webhook. This is
  the natural follow-up and would stop setters typing an outcome they just entered in
  the CRM, but the webhook payload shape is undocumented and needs a live capture
  first. Separate build.
- Mobile. The link opens CRM mobile web, not the LeadConnector app. Desktop setters are
  the assumed user.

## Risks

- **Setter must be logged into the CRM in that browser.** One-time, session persists.
  Not mitigated in code; it is a training note.
- **The Setter Suite Calendar tab is being built elsewhere.** This branch touches
  `SetterSuite.tsx`, so expect a small merge conflict in the props/render area.
- **Unverifiable by me.** The Setter Suite is admin-gated and I cannot mint a session,
  so the rendered result needs Jake's eyeball. Automated proof stops at tests plus the
  built bundle containing the URL string.
