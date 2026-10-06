# 0. Claude in the app (foundation)

## Goal

One backend helper that sends a prompt plus the client's facts to Claude and gets back validated JSON. Plans 1, 2 and 4 call it. Nothing visible on its own.

## Definition of done

- `functions/lib/claude.ts` exports `writeWithClaude<T>(env, { system, input, schema, maxTokens })` returning `{ ok: true, data: T } | { ok: false, error }`.
- Uses the official `@anthropic-ai/sdk` (works on Workers), model `claude-opus-5-5`, `output_config.effort: "medium"`, structured output via `output_config.format` (JSON schema), and the server-side refusal fallback (`betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`).
- Checks `stop_reason` (`refusal`, `max_tokens`) before reading content. Typed SDK errors mapped to short messages ("Claude is busy, try again" on 429/529).
- `ANTHROPIC_API_KEY` read from env; missing key returns `{ ok: false, error: "Claude is not set up" }` and the UI shows that, never a crash.
- Every call logged to `ai_runs` (tenant, kind, input tokens, output tokens, ok, error) so spend is visible.

## What exists

- No Claude API anywhere in `functions/` today. Conversion Assets hands over a prompt instead.
- Secrets live in Doppler `hauck-command-center` / `prd` and sync to Cloudflare (agent reads Doppler, never writes).

## Design

- `functions/lib/clientFacts.ts`: one function `clientFacts(client, tenantId)` that gathers what every prompt needs, from `tenants` + the intake submission + `onboarding.fields`: business name, trade (niche), owner first/full name, city/state, target zips + area callout, services 1 to 6, USP, website, hours, whether the lead form asks for an address. Pure mapper `toFacts(rows)` is unit tested; the loader is thin.
- `functions/lib/claude.ts`: the call. Schema in, typed data out. No streaming (outputs are short, `max_tokens` about 4000).
- Prompts live next to each feature (`ltnPrompt.ts` etc.), each with a fixed system prompt carrying the voice rules from `vault/About/Hauck Marketing.md` (no em dashes, plain words, short) and the SOP examples as style references.
- Migration `0140_ai_runs.sql`: `ai_runs(id, tenant_id, kind, model, input_tokens, output_tokens, ok, error, created_at)`, service role only.

## Files

- Create: `functions/lib/claude.ts`, `functions/lib/claude.test.ts`, `functions/lib/clientFacts.ts`, `functions/lib/clientFacts.test.ts`, `supabase/migrations/0140_ai_runs.sql`
- Modify: `functions/lib/env.ts` (add `ANTHROPIC_API_KEY?: string`), `command-center/app/package.json` (add `@anthropic-ai/sdk`)

## Tasks

1. Add the SDK, confirm `vite build` + `wrangler pages dev` still bundle (Workers compatibility).
2. TDD `toFacts`: intake present, intake missing (manual client), blank services dropped, zips trimmed to 20.
3. TDD `writeWithClaude` with an injected fake client: ok path returns parsed data; `refusal` returns error; `max_tokens` returns error; missing key returns "Claude is not set up"; schema mismatch returns error.
4. Migration 0140 via `npm run db:migrate`.
5. One live smoke call from a script (`scripts/claude-smoke.mjs`) against Willis facts, printed, not stored.

## Tests

Vitest for `toFacts` and `writeWithClaude` (fake SDK client). One manual live call.

## Cost

About 2k input + 1k output tokens per pack at $4 / $20 per million: roughly 3 cents a click.

## Jake owes

1. Create an Anthropic API key and add it to Doppler as `ANTHROPIC_API_KEY` (`hauck-command-center` / `prd`).
