# Grok Bots

Hauck's Grok Bot agents get one custom connector per system Grok cannot connect itself. Jake connects the rest (Supabase, Drive, Gmail) in Grok and writes each bot's instructions there; nothing here scripts how a bot behaves.

| Connector | URL on the app | What it does |
|---|---|---|
| Hauck GHL | `/api/grok/ghl/<GROK_MCP_KEY>` | The whole GHL API v2 through the Marketplace app, with every scope ticked on the app: every client sub-account, any other sub-account in the agency by name or locationId (Test Account, Hauck Marketing), plus the agency |
| Hauck Meta | `/api/grok/meta/<GROK_MCP_KEY>` | All of Meta: `meta_request` makes any Graph API call on every client ad account and Facebook Page, mapped by `meta_accounts`; plus results, structure, assets and paused builds. Refused: budgets, bids, spend caps, and switching a campaign, ad set or ad on or off. New ones are made PAUSED |
| Hauck Software | `/api/grok/software/<GROK_MCP_KEY>` | The whole Command Center: `software_request` calls any page's API as Jake (admin pages) or as the client's owner (their app), mapped by `software_routes`; plus named tools for new clients (held at setup), logins, GHL links, client and app health, re-running setup values, Go Live, the client's dialing script and notes on Client Setting, and adding Finished Creatives. Every change is logged before it is made |

The code is in `apps/command-center/functions/lib/grokGhl.ts`, `grokMeta.ts` (with `grokMetaRequest.ts`) and `grokSoftware.ts`. Every change a bot makes is logged in the app's audit log before it is sent.

`guides/` holds reference files to upload to a bot in Grok if it needs them.

## Set up (once)

The key is in Doppler `hauck-command-center/prd` as `GROK_MCP_KEY`.

1. Grok, Connectors, New Connector, Custom. Name **Hauck GHL**, URL `https://app.hauckmarketing.com/api/grok/ghl/<GROK_MCP_KEY>`.
2. Same again: **Hauck Meta**, URL `https://app.hauckmarketing.com/api/grok/meta/<GROK_MCP_KEY>`.
3. Same again: **Hauck Software**, URL `https://app.hauckmarketing.com/api/grok/software/<GROK_MCP_KEY>`.
4. Delete the old Hauck Brain connector.
