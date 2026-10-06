# 4. Dialing script

## Goal

In a client's Setter Suite > Settings, a "Write from template" button: Claude reads the "Client Dialing/Voicemail Script | TEMPLATE" doc in 🚀 Client Setup, fills it for this client, and puts the result in the client's dialing script (the one the cockpit overlay shows).

## Definition of done

- Button beside the existing script editor in Setter Suite Settings (client view).
- Template read live from Drive (doc id `1FPm791CduIxJGe4DdoEiOqINHP0H0EqbIS8d_VRC4RQ`, stored as a setting, not hard-coded), so Jake edits the doc and the next write follows.
- Filled: `{{Company Name}}`, `{{offer / service / result}}`, `{{what they're trying to accomplish}}` and any other client-specific spot, plus trade wording where the template is generic.
- Left exactly as written, because they are said live on the call: `{{First Name}}`, `{{Your Name}}`. Checked after the write; if Claude touched them, the result is rejected and retried once.
- Headings, caller/prospect lines and the dividers keep their structure. Output goes through the existing `setterScript.ts` sanitizer before it is saved.
- If the client already has a script, a confirm: "Replace the current script?" The old one is kept as `previous_html` for one undo.

## What exists

- `setter_scripts` (0044): one sanitized HTML script per client, edited in Setter Suite Settings, shown in `SetterScriptOverlay`.
- `driveComposio.exportDocHtml(env, account, fileId)` reads a Google Doc as HTML.
- Plan 0 helper + `clientFacts`.

## Design

- `functions/lib/scriptPrompt.ts`: input = template HTML + facts; output schema `{ html }`. System prompt: keep every line's role and order, fill only `{{...}}` spots that are about the client, never the two live ones.
- `functions/lib/scriptGuards.ts` (pure): `liveTokensIntact(before, after)`, `unfilledClientTokens(after)`.
- Migration 0142: `setter_scripts.previous_html text` + `agency_settings.dialing_template_doc_id` (or a row in the existing settings store, check which one Settings uses).
- API: `POST /api/admin/clients/:tenantId/setter-script/write`, `POST .../setter-script/undo`.

## Files

- Create: `functions/lib/scriptPrompt.ts`, `functions/lib/scriptGuards.ts` (+ test), `functions/api/admin/clients/[tenantId]/setter-script/write.ts`, `.../undo.ts`, `supabase/migrations/0142_setter_script_template.sql`
- Modify: `src/components/admin/setter/SetterSettings.tsx`, `src/hooks/useApi.ts`, `src/lib/releaseNotes.ts`

## Tasks

1. Spike: export the template doc through Composio and look at the HTML (formatting survives? dividers?).
2. TDD `scriptGuards`.
3. Migration 0142, endpoints, sanitizer on the way in.
4. Button + confirm + undo in Settings.
5. Release note.

## Tests

Vitest for guards and the write handler (fake Drive + fake Claude). Live: Willis, compare to the template side by side.

## Jake owes

Nothing new beyond plan 0's key.
