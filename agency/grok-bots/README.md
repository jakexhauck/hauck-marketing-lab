# Grok Bots

Hauck's team of Grok Bot agents. They replace the Hermes agents. Every bot reads the business through one custom connector, the Hauck Brain (`/api/grok/mcp/<key>` on the app).

| Bot | Folder |
|---|---|
| Executive Assistant | `executive-assistant/` |
| Success Manager | `success-manager/` |
| Ads | `ads/` |
| Creative | `creative/` |
| Market Research | `market-research/` |
| GHL | `ghl/` |

## Files

- `house-rules.md`: rules every bot follows, served with every `get_rules` call
- `<bot>/rules.md`: that bot's full working rules, served live by `get_rules`
- `<bot>/bot.md`: what goes into Grok Bot (name, title, description, short instructions, routines, test prompts)
- `<bot>/knowledge/`: hand-written guides only that bot uses
- `build.mjs`: bundles rules, guides and vault client notes into the app. Runs on every app build

Edit a `rules.md` or `house-rules.md`, push to main, and every bot has it after the deploy. No re-pasting.

## Set up (once)

1. Grok, Connectors, New Connector, Custom. URL: `https://app.hauckmarketing.com/api/grok/mcp/<GROK_MCP_KEY>` (the key is in Doppler `hauck-command-center/prd`). Name it **Hauck Brain**.
2. For each bot, create it in Grok Bot and fill Name, Title, Description and Instructions from its `bot.md`.
3. Add each bot's Routines from its `bot.md`.
4. Settings > General > Agent: paste the agent rules from `house-rules.md` (no logging into Meta, GHL, banks or payment sites).
5. Make a group chat **Hauck Team** with all six bots.
6. Run each bot's test prompts.
