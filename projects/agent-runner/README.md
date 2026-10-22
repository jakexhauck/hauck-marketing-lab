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

- VPS (`deploy/vps/`): every agent on Hermes, in the `hauck-agent-runner` container beside Hermes.
- PC (logon task below): `AGENT_AGENTS=none` and `AGENT_PC_JOBS=1`: no chats, only the clip video work the VPS's Ads turns send it (`src/pcJobs.ts`, plan `docs/build-plans/hermes-ads.md`).

The Hermes profiles have no shell. Their GHL, Meta, Ads Manager, file and Higgsfield tools are MCP tools the runner serves on port 8700 (`src/mcpBridge.ts`), each profile with its own token. Higgsfield uses the runner's own login (`src/higgsfield.ts`); generate tools answer only on a turn carrying Jake's spend grant.

### VPS

Once, as root on the VPS:

1. Deploy key: `ssh-keygen -t ed25519 -N "" -f /srv/hauck/ssh/id_ed25519`, add the `.pub` to the GitHub repo's Deploy keys with write access, then `ssh-keyscan github.com > /srv/hauck/ssh/known_hosts` and `git clone git@github.com:jakexhauck/hauck-marketing-lab.git /srv/hauck/repo` (with `GIT_SSH_COMMAND="ssh -i /srv/hauck/ssh/id_ed25519"`), and set `user.name`/`user.email` in the clone.
2. `/root/hauck-runner/doppler.env`: `DOPPLER_TOKEN=<read-only service token for hauck-command-center/prd>`.
3. Drive: `docker run --rm -it -v /srv/hauck/config:/config -e RCLONE_CONFIG=/config/rclone.conf rclone/rclone config`, a remote named `gdrive` (Google Drive, Jake's account).
4. `sh /srv/hauck/repo/projects/agent-runner/deploy/vps/setup.sh`
5. Higgsfield: `docker exec -it hauck-agent-runner npx tsx src/higgsfieldLogin.ts`, then open the link it prints and approve. Then `docker restart hauck-agent-runner`.

Logs: `docker logs -f hauck-agent-runner`. Update: `docker exec hauck-agent-runner git -C /repo pull && docker restart hauck-agent-runner` (the clone's git is set up for the container's key path). Off: `docker stop hauck-agent-runner`.

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
- `src/pcJobs.ts`: clip video work from the VPS to the PC. `src/higgsfield.ts`, `src/higgsfieldLogin.ts`: the runner's Higgsfield login and client.
- `src/output.ts`: the lessons, item and request blocks.
- `src/brain.ts`, `src/git.ts`: brain files and `brain:` commits (explicit pathspecs only).
- `src/clients.ts`: tenant slug to vault folder and Drive folder.
- `src/monitor.ts`, `src/monitorRules.ts`: startup monitoring.
- `src/wire.ts`: mirrors `apps/command-center/src/lib/agentWire.ts`.
- `bin/meta.mjs`: read-only Meta insights for the Ads, Reporting and Manager agents.
