# 15 — Sales section + Website Form Submissions

## Frame

Add a **Sales** group to the desktop sidebar. It is a collapsible section, not a
flat link. Inside it, for now: **Form Submissions** (new) and **Pipeline**
(moved in). The other sales-adjacent surfaces (Inbox, Contacts, Calendar) stay
top-level, by Jake's call.

**Form Submissions** shows the estimate-request submissions that come off the
client's website estimate form. Today the data is a deterministic sample set,
clearly labelled as such. It is wired to a single seam so a later GoHighLevel
hook-up is a one-function swap with no UI change.

### Definition of done

- Sidebar shows a collapsible "Sales" group containing Form Submissions +
  Pipeline; it auto-opens when one of its routes is active and remembers its
  open/closed state.
- `/sales/forms` renders a Form Submissions page: header, a clear "sample data"
  notice, KPI band, status filter, and a submissions list (table on desktop,
  cards on phone) with expandable per-submission detail.
- Phone bottom bar and per-surface permissions are unchanged.
- `tsc` + `vite build` pass.

## Data source

There is no forms integration in the backend yet. This follows the exact seam
the Paid Ads surface uses (`lib/adsData.ts` + `hooks/useAds.ts`):

- `lib/formSubmissions.ts` — `DEMO = true`, a deterministic builder keyed off the
  client name so the figures are stable and internally consistent.
- `hooks/useFormSubmissions.ts` — returns that dataset today; swap the body for a
  query (GHL Forms submissions API, via a `/api/forms/submissions` Function) when
  the real source lands. The exported shapes stay the same, so nothing
  downstream changes.

## Files

| File | Change |
| --- | --- |
| `src/lib/nav.ts` | Add `NavGroup` + `NavEntry` types; `NAV` holds a Sales group with Form Submissions + Pipeline; add `flattenNav`, `isNavGroup`, group-aware `visibleNav`. `filterNav` (flat) stays for the bottom bar. |
| `src/components/Sidebar.tsx` | Render groups as a collapsible section (chevron, auto-open on active child, localStorage persistence). |
| `src/components/BottomNav.tsx` | Source items from `flattenNav(NAV)` so the bottom bar is unaffected by grouping. |
| `src/lib/formSubmissions.ts` | New. DEMO dataset of estimate-form submissions + summary KPIs. |
| `src/hooks/useFormSubmissions.ts` | New. The GHL swap seam. |
| `src/routes/FormSubmissions.tsx` | New. The page. |
| `src/App.tsx` | Register `/sales/forms`. |

## Permissions

Form Submissions reuses the existing `pipeline` capability (inbound leads are
sales data), so no change to `lib/capabilities.ts` or the backend
`permissions.ts` is needed for this pass.

## Later (out of scope here)

- `/api/forms/submissions` Cloudflare Function reading GHL Forms submissions.
- "Add to pipeline" action turning a submission into an opportunity.
- A dedicated `forms` capability if Jake wants to gate it separately from
  Pipeline.
