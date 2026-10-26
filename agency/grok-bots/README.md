# Grok bots

Service delivery bots, one Grok Project each. They replace the Hermes agents.

| Bot | Status |
|---|---|
| Creative | Built (pilot) |
| Ads | Next |
| Market Research | Next |
| GHL | Next |
| Manager | Next |

## Each bot folder

- `instructions.md`: paste into the Grok Project's instructions
- `tests.md`: prompts to check it works
- `knowledge/`: hand-written files only this bot gets
- `upload/`: every file to upload to the Project (built, not edited by hand)

## Rebuild the upload files

Run after client facts change in the vault:

```
node agency/grok-bots/build.mjs
```

Then re-upload `Clients.md` to every Project.

## Set up a bot in Grok

1. Create a new Project named after the bot
2. Paste `instructions.md` into the Project instructions
3. Upload everything in `upload/`
4. Run each prompt in `tests.md` in a fresh chat
