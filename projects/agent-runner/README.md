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

## Two runners: Hermes on the VPS, claude on the PC

`AGENT_ENGINE=hermes` answers with each agent's own Hermes profile instead of `claude -p` (`src/hermes.ts`, plan `docs/build-plans/hermes-agents.md`). `AGENT_AGENTS` is the list of agents a runner claims, so two runners never take the same message:

- VPS (`deploy/vps/`): `manager,csm,research,ghl` on Hermes, in the `hauck-agent-runner` container beside Hermes.
- PC (logon task below): `AGENT_AGENTS=ads` on claude, for the video and deploy work that needs this PC.

The Hermes profiles have no shell. Their GHL and Meta tools are MCP tools the runner serves on port 8700 (`src/mcpBridge.ts`), each profile with its own token.

### VPS

Once, as root on the VPS:

1. Deploy key: `ssh-keygen -t ed25519 -N "" -f /srv/hauck/ssh/id_ed25519`, add the `.pub` to the GitHub repo's Deploy keys with write access, then `ssh-keyscan github.com > /srv/hauck/ssh/known_hosts` and `git clone git@github.com:jakexhauck/hauck-marketing-lab.git /srv/hauck/repo` (with `GIT_SSH_COMMAND="ssh -i /srv/hauck/ssh/id_ed25519"`), and set `user.name`/`user.email` in the clone.
2. `/root/hauck-runner/doppler.env`: `DOPPLER_TOKEN=<read-only service token for hauck-command-center/prd>`.
3. Drive: `docker run --rm -it -v /srv/hauck/config:/config -e RCLONE_CONFIG=/config/rclone.conf rclone/rclone config`, a remote named `gdrive` (Google Drive, Jake's account).
4. `sh /srv/hauck/repo/projects/agent-runner/deploy/vps/setup.sh`

Logs: `docker logs -f hauck-agent-runner`. Update: `git -C /srv/hauck/repo pull && docker restart hauck-agent-runner`. Off: `docker stop hauck-agent-runner`.

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
- `src/hermes.ts`: the same turn on the agent's Hermes profile. `src/mcpBridge.ts` + `src/appOps.ts`: the app's tools for Hermes.
- `src/drive.ts`: the VPS's rclone Drive mirror. `deploy/vps/`: the VPS container and profile setup.
- `src/output.ts`: the lessons, item and request blocks.
- `src/brain.ts`, `src/git.ts`: brain files and `brain:` commits (explicit pathspecs only).
- `src/clients.ts`: tenant slug to vault folder and Drive folder.
- `src/monitor.ts`, `src/monitorRules.ts`: startup monitoring.
- `src/wire.ts`: mirrors `apps/command-center/src/lib/agentWire.ts`.
- `bin/meta.mjs`: read-only Meta insights for the Ads, Reporting and Manager agents.
