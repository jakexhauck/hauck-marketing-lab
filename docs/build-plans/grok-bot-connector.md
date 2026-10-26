# Grok Bot connector ("Hauck Brain")

## Frame

Jake is replacing the Hermes agents with **Grok Bot** (xAI's always-on agents: own cloud computer, own memory, bots message each other, group chats of up to 6, routines). Six bots: Executive Assistant (chief of staff), Success Manager, Ads, Creative, Market Research, GHL.

Bots need live business context and tools. Grok Bot connectors are **account-level and shared by every bot**, so access cannot be scoped per bot: every tool is read-only except one note-taking write.

Done when: Jake adds one custom connector URL in Grok, each of the six bots is set up from `agency/grok-bots/<bot>/bot.md`, and each bot's test prompts pass against live data.

## Decisions

- **Where:** a Pages Function in the command-center app, `POST /api/grok/mcp/<key>`. Reuses every secret and lib already bound. No new server.
- **Auth:** a capability URL. `GROK_MCP_KEY` (32+ chars, Doppler + CF Pages) is the last path segment, compared timing-safe in a middleware gate (`lib/grokMcp.ts isGrokMcpRequest`) that only opens this one path. The spike showed Grok connects with no auth header; OAuth is a later upgrade.
- **Protocol:** stateless MCP Streamable HTTP, JSON responses only (proven against Grok in the spike: initialize, tools/list, tools/call). GET and DELETE get 405.
- **Context source:** `agency/grok-bots/build.mjs` writes `functions/lib/grokBundle.generated.ts` (bot rules, house rules, guides, vault client notes). It runs in `pnpm build`, so every push to main (vault edits, brain commits) refreshes what bots read. The generated file is committed so typecheck works locally.
- **Only write:** `save_note` inserts into a new `grok_notes` table (mig 0183). `get_client` shows the latest notes, so every bot sees a saved fact on its next call. No repo writes.
- **Never exposed:** intake `password_plain`, GHL secret custom values (already hidden by `read.customValues`), lead names/phones/emails (lead results return KPIs and per-ad breakdown only), any token.

## Tools

| Tool | Backed by |
|---|---|
| `get_rules(bot)` | bundle: house rules + that bot's rules + tool guide |
| `get_guide(name)` | bundle: copy guides, b-roll prompts, fulfillment SOP |
| `list_clients()` | `tenants` minus `isNotAClient`, plus `client_billing.status` |
| `get_client(client)` | `loadClientFacts`, `client_briefs` client section, vault Profile/Memory/Brain, latest `grok_notes` |
| `get_research(client)` | `readPages` research page |
| `get_ads_plan(client)` | `readPages` ads page + `listAdCreatives` names |
| `get_ad_results(client, days, level)` | Meta insights, same query as `api/agent-runner/meta.ts` |
| `get_ad_structure(client)` | `META_OPS["read.structure"]` via a new exported `runMetaRead` |
| `get_lead_results(client, range)` | `buildTrackerResponse` minus `leads` |
| `get_ghl_setup(client)` | `GHL_OPS` reads (pipelines, customValues, customFields, calendars) + workflows + phone |
| `get_tasks(client)` | `readTasks` + `client_billing` row |
| `places_search(query)` / `places_reviews(place_id)` | classic Places API, `GOOGLE_PLACES_API_KEY` (ported from runner `placesTools.ts`) |
| `save_note(client, bot, note)` | insert `grok_notes`, 500 chars max, 100 a day |

`client` takes a name or slug, matched case-insensitively; an ambiguous match returns the options.

## Files

1. `supabase/migrations/0183_grok_notes.sql`: table, RLS on with no policies (service role only).
2. `functions/lib/grokMcp.ts`: gate, JSON-RPC handler, client matcher, tool registry.
3. `functions/lib/grokTools.ts`: the tool implementations (thin wrappers over existing libs).
4. `functions/lib/grokBundle.generated.ts`: generated.
5. `functions/api/grok/mcp/[key].ts`: the route.
6. `functions/api/_middleware.ts`: add the gate.
7. `functions/lib/agentMetaOps.ts`: export `runMetaRead`.
8. `functions/lib/grokMcp.test.ts`: protocol, gate, matcher, tool list, note validation, bundle covers all six bots.
9. `agency/grok-bots/`: `house-rules.md`, `<bot>/rules.md` + `<bot>/bot.md` (name, title, description, stub instructions, routines, tests) for all six; `build.mjs` rewritten to emit the bundle; README rewritten for Grok Bot.
10. `package.json`: build runs `node ../../agency/grok-bots/build.mjs` first.

## Verify

- `pnpm typecheck`, `vitest run`.
- After deploy: curl initialize / tools/list / each read tool against Willis; wrong key gets 401.
- Jake: add connector, set up the six bots, run the tests in each `bot.md`.

## Ship

Security review (M8: public endpoint, service-role reads). Merge to main, push, watch the CF deploy, smoke-test live, take the spike Worker down, delete this plan.
