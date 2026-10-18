# agent-runner

The PC half of the Command Center Agents section. It claims queued agent messages from `app.hauckmarketing.com/api/agent-runner/*`, runs `claude -p` with the agent's bundle, posts the reply back, and is the only writer of the vault brain notes. Design and plan: `docs/build-plans/agents.md`.

## Run

```
npm install
npx tsx src/main.ts                         # watch
npx tsx src/main.ts --once                  # one message, then exit
npx tsx src/main.ts --once --sync-lessons   # also mirror every Brain.md to the app
npx vitest run                              # tests
```

The secret comes from Doppler (`AGENT_RUNNER_SECRET`, `hauck-command-center`/`prd`) at start. `AGENT_RUNNER_SECRET`, `AGENT_RUNNER_API`, `AGENT_DRIVE_ROOT` and `CLAUDE_BIN` in the environment override the defaults.

## Install as a logon task

```
.\install-watcher.ps1            # install and start
.\install-watcher.ps1 -Status
.\install-watcher.ps1 -Uninstall
```

Off switch: create `data\.stop`.

## Layout

- `agents/<id>.md`: each agent's instructions. `_rules.md`, `_protocol.md` and `_copy.md` go into every agent's prompt.
- `agents/copy/`: the four copy skills (Ogilvy, Copywriting, Copy Editing, Stop Slop), copied into each work folder as `copy-skills/` every turn. Source in its README.
- `src/bundle.ts`: instructions + brains + allowed tools per agent.
- `src/claude.ts`: spawns `claude -p`, parses stream-json.
- `src/output.ts`: the lessons, item and request blocks.
- `src/brain.ts`, `src/git.ts`: brain files and `brain:` commits (explicit pathspecs only).
- `src/clients.ts`: tenant slug to vault folder and Drive folder.
- `src/monitor.ts`, `src/monitorRules.ts`: startup monitoring.
- `src/wire.ts`: mirrors `apps/command-center/src/lib/agentWire.ts`.
- `bin/meta.mjs`: read-only Meta insights for the Ads, Reporting and Manager agents.
