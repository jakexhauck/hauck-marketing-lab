# Grok Bots

Hauck's Grok Bot agents get one custom connector per system Grok cannot connect itself. Jake connects the rest (Supabase, Drive, Gmail) in Grok and writes each bot's instructions there; nothing here scripts how a bot behaves.

| Connector | URL on the app | What it does |
|---|---|---|
| Hauck GHL | `/api/grok/ghl/<GROK_MCP_KEY>` | The whole GHL API v2 through the Marketplace app: every client sub-account, plus the agency |
| Hauck Meta | `/api/grok/meta/<GROK_MCP_KEY>` | Each client's Meta ads: results, structure, assets, and builds (always PAUSED, budgets capped) |
| Hauck Software | `/api/grok/software/<GROK_MCP_KEY>` | The Command Center itself: new clients (held at setup), logins, GHL links, client and app health, re-running setup values, Go Live, the client's dialing script and notes on Client Setting. No deletes, no password resets |

The code is in `apps/command-center/functions/lib/grokGhl.ts`, `grokMeta.ts` and `grokSoftware.ts`. Every change a bot makes is logged in the app's audit log before it is sent.

`guides/` holds reference files to upload to a bot in Grok if it needs them.

## Set up (once)

The key is in Doppler `hauck-command-center/prd` as `GROK_MCP_KEY`.

1. Grok, Connectors, New Connector, Custom. Name **Hauck GHL**, URL `https://app.hauckmarketing.com/api/grok/ghl/<GROK_MCP_KEY>`.
2. Same again: **Hauck Meta**, URL `https://app.hauckmarketing.com/api/grok/meta/<GROK_MCP_KEY>`.
3. Same again: **Hauck Software**, URL `https://app.hauckmarketing.com/api/grok/software/<GROK_MCP_KEY>`.
4. Delete the old Hauck Brain connector.
