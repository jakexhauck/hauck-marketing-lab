# Cold Call: four scripts, tracked, and a shelf to put everything else on

Agreed with Jake on 2026-07-27. Two things that turn out to be one thing.

1. **Four variations of one pitch, running against each other.** Every recorded
   dial says which variation was on screen, so "which script books meetings" is
   answered by the app rather than argued about.
2. **A place in Settings for everything else a caller needs mid-call**, starting
   with objection handling. Jake names the categories himself, so he is never
   waiting on a code change to add a heading.

## 1. Definition of done

- Settings holds four (or any number of) named dialing scripts, each editable in
  the same doc editor the single script used.
- Each one shows its own dials, pickups, meetings booked and booking rate, all
  derived from `cold_call_dials`. No typed cell anywhere in it.
- The caller picks a variation in the floating panel. It sticks across pages and
  across a reload, and every outcome pressed afterwards records it.
- Settings also holds owner-named asset categories (Objection handling,
  Voicemail, whatever Jake types) with documents under each.
- The caller reads those assets in the same floating panel, without leaving the
  call.
- A dial can never claim a variation that was not on screen, and the browser
  cannot invent one.

## 2. Why the caller picks, and what that costs

Jake chose picking over automatic rotation. That is the honest recording of what
was actually said, and it is worth being explicit that it buys honesty at the
cost of a fair split: whoever is dialing will drift toward the script they like,
so the four variations will not get equal numbers, and a 20% booking rate on 12
dials is not evidence.

So the numbers are shown as counts first and rate second, and a variation under
25 dials says so rather than showing a percentage that reads like a finding. The
app should not present a hunch in the typography of a result.

## 3. Data model

Migration `0058_cold_call_assets.sql`.

```
cold_call_assets
  id          uuid pk
  kind        text not null check (kind in ('script','asset'))
  category    text not null default ''   -- owner-named heading; '' for scripts
  name        text not null
  html        text not null default ''   -- sanitized, same boundary as 0048
  sort_order  int  not null default 0
  archived_at timestamptz                -- retired, but its dials still count
  created_at / updated_at / updated_by
```

One table rather than two, because a script variation and an objection-handling
document are the same thing (a named piece of sanitized HTML the caller reads);
`kind` is the one extra job a script has, which is being the unit of the test.
`category` is meaningless for a script and always empty, which is the price.

`cold_call_dials.script_id uuid references cold_call_assets(id) on delete set null`.

Null means the dial predates this, or nothing was selected. Archiving a variation
must never erase the dials that tested it, which is why archived_at exists and
delete is discouraged.

The existing single script (`cold_call_script`, 0048) is copied in as the first
variation if it has any content. That table is then left alone rather than
dropped: dropping is not reversible and additive migrations are the house rule.

## 4. Where the selection lives

Not in a context provider. `ScriptPanel` is rendered by `ColdCallSection` and
`CallWorkspace` sits three components below it, so passing it down means
threading a prop through two files that have no interest in it.

`src/lib/selectedScript.ts`: a `useSyncExternalStore` over one localStorage key.
Any component reads or sets it, they all re-render together, and it survives a
reload, which is what "it sticks" means. It also means a caller's choice is
per-device, which is correct: it is a preference, not a record.

If nothing is selected, the first active variation is selected automatically, so
"tracked every single time" holds as long as one script exists.

## 5. File-by-file

1. `supabase/migrations/0058_cold_call_assets.sql` — the table, the dial column,
   the copy-forward.
2. `functions/lib/coldCallAssets.ts` (+ test) — the kinds, name/category
   validation, ordering, and the per-variation stats math. Pure.
3. `functions/api/admin/cold-call/assets.ts` — GET list (any admin), POST /
   PATCH / DELETE (owner only). Stats ride on the GET.
4. `functions/api/admin/cold-call/dials.ts` — accept and validate `scriptId`.
5. `functions/lib/adminRoles.ts` — the new path, read for a caller.
6. `src/lib/api.ts`, `src/hooks/useColdCallAssets.ts` — types and fetchers.
7. `src/lib/selectedScript.ts` (+ test) — the sticky selection.
8. `src/components/admin/script/ScriptPanel.tsx` — a variation picker and an
   asset list, without disturbing the Setter Suite's use of it.
9. `src/components/admin/acquisition/ScriptsPanel.tsx` — Settings: the
   variations and their numbers.
10. `src/components/admin/acquisition/AssetsPanel.tsx` — Settings: owner-named
    categories and their documents.
11. `src/components/admin/acquisition/ColdCallSettings.tsx` — mount both.
12. `src/components/admin/acquisition/CallWorkspace.tsx` — send `scriptId` on
    every outcome, and say on the call card which script is loaded.

## 6. Verify

`npm test && npm run typecheck && npm run build`, the migration applied, then on
localhost: create four variations, pick one, press outcomes, and watch that
variation's dial count move on its own while the other three stay still.
