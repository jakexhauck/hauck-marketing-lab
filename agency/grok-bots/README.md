# Grok Bots

Hauck's Grok Bot agents reach the Command Center through one custom connector, the Hauck Brain (`/api/grok/mcp/<key>` on the app). Jake writes each bot's instructions in Grok himself; nothing here scripts how a bot behaves.

## Files

- `guides/`: reference guides served by `get_guide`, alongside the copy guides in `projects/agent-runner/agents/copy/`, the fulfillment SOP and the Mission Control maps (both rendered from the app's code)
- `build.mjs`: bundles the guides and every client's vault notes into the app. Runs on every app build

The tools live in `apps/command-center/functions/lib/grokTools.ts` (reads) and `grokWriteTools.ts` (changes). Every change a bot makes is logged in the app's audit log.

## Set up (once)

1. Grok, Connectors, New Connector, Custom. URL: `https://app.hauckmarketing.com/api/grok/mcp/<GROK_MCP_KEY>` (the key is in Doppler `hauck-command-center/prd`). Name it **Hauck Brain**.
2. Write each bot's instructions in Grok.
