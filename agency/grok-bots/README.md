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
- `<bot>/setup.txt`: the one message pasted into a bot's chat to set it up. Made from `bot.md` by `node agency/grok-bots/setup.mjs`; run it again after a `bot.md` changes

Edit a `rules.md` or `house-rules.md`, push to main, and every bot has it after the deploy. No re-pasting.

## Set up (once)

Grok Bot has no instructions field, so each bot is set up by chat.

1. Grok, Connectors, New Connector, Custom. URL: `https://app.hauckmarketing.com/api/grok/mcp/<GROK_MCP_KEY>` (the key is in Doppler `hauck-command-center/prd`). Name it **Hauck Brain**.
2. For each bot: open `<bot>/setup.txt`, copy all of it, paste it into that bot's chat and send. The bot saves it, makes its routines and checks the connector.
3. Make a group chat **Hauck Team** with all six bots.
4. Run each bot's test prompts from its `bot.md`.
