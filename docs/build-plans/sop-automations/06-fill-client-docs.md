# 6. Fill the copied Drive docs

## Goal

After the Create client folder button copies the 🚀 Client Setup docs, a "Fill in docs" step swaps every known `[SQUARE BRACKET]` spot in the copies for the client's details. Jake opens a client folder and the docs already say their name, city and trade.

## Definition of done

- Runs automatically right after the folder button copies the docs, and on its own from a "Fill in docs" button on the same card (for folders made before this shipped, or after editing the client's details).
- Only the client's own folder is touched, never the 🚀 Client Setup templates.
- Known spots (case-insensitive, spaces tolerated):

| Spot | Value |
|---|---|
| `[CLIENT NAME]`, `[BUSINESS NAME]`, `[COMPANY NAME]` | business name |
| `[OWNER NAME]` / `[OWNER FIRST NAME]` | contact full / first name |
| `[CITY]`, `[STATE]` | intake address |
| `[TRADE]`, `[NICHE]` | niche |
| `[WEBSITE]` | website |
| `[PHONE]` | client phone |
| `[SERVICE AREA]` | area callout |
| `[ADD CLIENT CITY AREA CODE]`, `[AREA CODE]` | area code from the client phone |

- After a run the card shows "Filled 14 spots in 5 docs" and lists bracket spots it did not recognise ("[Angle 1] in Video Scripts"), so Jake knows what is still manual. Unknown spots are never guessed.
- Running twice is safe (filled spots are gone, so nothing changes).

## What exists

- `functions/lib/clientDriveFolder.ts`: makes "🤝 | Business" + Finished Creatives and copies every doc in 🚀 Client Setup as "WW | ..." (Composio).
- Templates found 2026-10-06: Client Setup SOP, Client Dialing/Voicemail Script, Video Scripts, Copy. The dialing script uses `{{...}}` spots, not brackets; those are left for plan 4 (and `{{First Name}}` / `{{Your Name}}` must never be filled).

## Design

- `functions/lib/docPlaceholders.ts` (pure): `placeholderMap(facts)` returns `{ token: value }` (blank values skipped, never written as empty), `findBracketTokens(text)`, `normaliseToken`.
- `functions/lib/docFill.ts`: for each Google Doc in the client folder: read text, find tokens, send one Docs API `documents.batchUpdate` with a `replaceAllText` per known token (`matchCase: false`).
- Transport is the risk: Composio's Drive connection may not carry the Docs API scope. Task 1 tries the Composio proxy against `docs.googleapis.com`; fallback is the Composio Google Docs toolkit (`GOOGLEDOCS_*` replace text), and last resort the direct Drive grant (`driveDirect.ts`, whose refresh token expires weekly).
- Result stored on the onboarding record (`drive_fill_result` jsonb) so the card can show the last run.

## Files

- Create: `functions/lib/docPlaceholders.ts` (+ test), `functions/lib/docFill.ts`, `functions/api/admin/clients/[tenantId]/drive-folder/fill.ts`, `supabase/migrations/0144_drive_fill_result.sql`
- Modify: `functions/lib/clientDriveFolder.ts` (call fill after copy), the folder card component in `components/admin/onboarding/`, `src/hooks/useApi.ts`, `src/lib/releaseNotes.ts`

## Tasks

1. Spike: one `replaceAllText` on a throwaway copy in Jake's Drive through Composio. Pick the transport.
2. TDD `placeholderMap` / `findBracketTokens` (case, spacing, blanks skipped, unknown tokens reported).
3. `docFill` + endpoint + migration.
4. Hook it into the folder button; add the button + result line to the card.
5. Release note.

## Tests

Vitest for the pure parts. Live: AAG's folder (Jake still owes the first folder press there), read a doc after.

## Jake owes

1. Put `[SQUARE BRACKET]` spots into the template docs where you want client details (the table above is the list the app knows).
2. Take the GHL password out of the 🛠️ Client Setup SOP before the next folder is made.
