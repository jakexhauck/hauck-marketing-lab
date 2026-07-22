# New Client Onboarding Wizard (admin)

Spec + implementation plan. One doc.

## Why

There is no way to create a client in the admin UI. The backend has been ready
the whole time: `POST /api/admin/clients` creates the tenant, seeds every
entitlement, and creates the owner login. It has zero callers. A comment in
`AdminClients.tsx:16` has been holding the space: *"Creating a client is
intentionally absent here for now; a dedicated onboarding flow will own that."*

Separately, Jake runs a client intake questionnaire as a Google Form. Its stated
purpose is three things: standing up the GHL sub-account, getting A2P phone
verification through, and giving a client something to do between paying and the
kickoff call so the engagement keeps momentum.

This build puts both halves on one screen.

## Scope

**In:** a six-step wizard plus a review screen at `/admin/clients/new`, fully
interactive, with local draft persistence.

**Out, deliberately:** API calls, migrations, new DB columns, file uploads to
Drive, sending the intake half to the client. The Create button renders disabled.
Wiring is a follow-up once Jake has felt the flow.

**Definition of done:** Jake can open `/admin/clients/new`, move through all six
steps, be blocked by validation on missing required fields, refresh the page
without losing what he typed, and see everything summarised on Review. Tests
green, typecheck clean.

## Field schema

Fields are declared as data in `src/lib/clientOnboarding.ts`, not hardcoded into
JSX. The wizard, the validation, and the Review screen all render from that one
array. Adding a field later is one line.

### Step 1 - Business

| Key | Label | Type | Req |
|---|---|---|---|
| `name` | Business name | text | yes |
| `niche` | Niche | text | yes |
| `appName` | App name | text | no |
| `subdomain` | Subdomain | text | yes |
| `websiteUrl` | Website URL | url | no |

`subdomain` auto-derives from `name` (slugified) until the user edits it, then it
stops tracking. `appName` placeholder shows the business name.

### Step 2 - Brand

| Key | Label | Type | Req |
|---|---|---|---|
| `brandColor` | Brand colour | color | yes |
| `brandInitials` | Brand initials | text | no |
| `logo` | Logo | file | no |
| `wonLabel` | "Won" label | text | no |
| `valueLabel` | "Job Value" label | text | no |

`brandColor` defaults to `#1d6fb8`, matching the API default. `brandInitials`
auto-derives from the first letters of `name`. Label fields default to `Won` and
`Job Value`.

### Step 3 - Access & Connections

| Key | Label | Type | Req |
|---|---|---|---|
| `ownerName` | Owner name | text | no |
| `ownerEmail` | Owner email | email | no |
| `ownerPassword` | Owner password | password | no |
| `ghlLocationId` | GHL Location ID | text | no |
| `ghlToken` | GHL Private Integration Token | password | no |
| `metaAdAccountId` | Meta ad account | text | no |
| `ga4PropertyId` | GA4 property ID | text | no |
| `googlePlaceId` | Google Place ID | text | no |

Every field on this step is optional and the step carries a note saying so: all
of it is PATCH-able later from the client config panel. Owner email and password
are a pair, so validation requires both or neither, and the password must be at
least 8 characters. That mirrors the API's own rule at
`functions/api/admin/clients/index.ts`.

### Step 4 - Contact & Legal

| Key | Label | Type | Req |
|---|---|---|---|
| `contactName` | Contact name | text | yes |
| `contactEmail` | Email | email | yes |
| `contactPhone` | Phone | tel | yes |
| `timezone` | Timezone | select | yes |
| `businessAddress` | Business address | textarea | yes |
| `taxId` | Tax ID / EIN | text | no |

`taxId` is labelled for what it is for: A2P phone registration. `timezone` is a
US-first select. This field is not cosmetic: the app currently has one global
booking timezone, and GHL has the Willis location set to `America/Cancun` for a
Garden City, Michigan business. Capturing it per client at intake is the first
half of that fix.

### Step 5 - Targeting & Ops

| Key | Label | Type | Req |
|---|---|---|---|
| `targetAreas` | Areas to target for ads | textarea | yes |
| `areaCallout` | Area callout | text | yes |
| `notifyPreference` | Lead notifications | radio | no |
| `calendarAvailability` | Calendar availability | textarea | no |
| `leadConnectorInstalled` | LeadConnector app installed | checkbox | no |

`targetAreas` and `areaCallout` carry the source doc's examples as placeholders.
`notifyPreference` is Text / Email / Both. `leadConnectorInstalled` is not a
question, it is a task: a checkbox with the iPhone and Android store links
rendered beside it.

### Step 6 - Story & Assets

| Key | Label | Type | Req |
|---|---|---|---|
| `usp` | Unique selling proposition | textarea | no |
| `whySignedUp` | Why they signed with Hauck Marketing | textarea | no |
| `notes` | Anything else | textarea | no |
| `headshot` | Headshot | file | no |
| `pastWorkPhotos` | Photos of past work | file (multiple) | no |

The source doc asks "what made you want to move forward with Noah & his
program?", carried over from whichever template it was copied from. Rewritten to
Hauck Marketing, same as the automations vendor scrub.

### Review

Groups every answered field by step. Missing required fields render in the
danger tone with a click-to-jump back to their step. The Create button is
present and disabled, with a note that wiring is the next build.

## Draft persistence

Text values autosave to `localStorage` under `hml.admin.newClient.draft`, debounced.

**`ownerPassword`, `ghlToken` and `taxId` are stripped before write.** A password,
an API token and a tax ID have no business sitting in a JS-readable store on a
shared machine. They survive a step change because they live in React state, but
not a refresh. The Access step carries a small note saying so, so nobody is
surprised when a refresh empties two boxes.

File fields hold `File` objects in memory only. They cannot serialise, and
nothing uploads.

## Files

**New**

- `src/lib/clientOnboarding.ts` - field schema, step definitions, `slugify`,
  `deriveInitials`, `validateStep`, `missingRequired`, `stripSensitive`,
  `TIMEZONES`.
- `src/lib/clientOnboarding.test.ts` - unit tests for all of the above.
- `src/routes/admin/AdminClientNew.tsx` - the wizard route.
- `src/components/admin/onboarding/WizardSteps.tsx` - the step header. Forked
  from `PipelineStepper.tsx`, which is inert by construction; the fork adds
  click-to-jump and a progress bar.
- `src/components/admin/onboarding/WizardField.tsx` - renders one field from its
  schema entry. Owns every input type in one place.

**Changed**

- `src/App.tsx` - add the `/admin/clients/new` route above `/admin/clients/:id`,
  wrapped in `AdminRoute`. Order matters or `new` is captured as an id.
- `src/components/admin/DeliveryRoster.tsx` - "New client" button in the roster
  head.
- `src/routes/admin/AdminPillarPage.tsx` - "New client" link in the Operations
  pillar's Admin tools block, above Onboarding.

## Build order

Test-first on the three pure pieces. The route is verified by running it.

1. **Schema and helpers.** Write `clientOnboarding.test.ts` covering: every field
   has a step and a unique key; `slugify` handles spaces, punctuation, casing and
   collapses repeats; `deriveInitials` handles one word, many words and empties;
   `validateStep` blocks on missing required fields and passes when filled;
   the owner email/password pairing rule both ways; the 8-character minimum;
   `stripSensitive` removes exactly the three keys and keeps the rest. Then write
   `clientOnboarding.ts` until green.
2. **WizardField.** One component, switching on `field.type`.
3. **WizardSteps.** Fork the stepper, add click-to-jump and the bar.
4. **AdminClientNew.** Compose: state, derived fields, step nav, validation gate,
   debounced draft save and load, Review.
5. **Route and entry points.** App.tsx, DeliveryRoster, AdminPillarPage.
6. **Verify.** `pnpm test`, `pnpm typecheck`, then run the app and walk all six
   steps in a real browser. Screenshot each one.

## Risks

- **Route ordering.** `/admin/clients/new` must be declared before
  `/admin/clients/:id` or React Router hands "new" to the detail page as an id.
  Caught by walking the route in the browser, not by tests.
- **A stale draft outliving its usefulness.** If Jake fills half a form, wanders
  off for a fortnight and comes back, he gets the old draft with no explanation.
  Mitigated by stamping the draft with a saved-at time and showing a "restored
  from <time>, discard" bar at the top of the wizard.
- **The form looks finished but saves nothing.** Anyone who opens it could
  reasonably assume it works. Mitigated by the disabled Create button carrying an
  explicit "not wired up yet" note rather than failing silently.
