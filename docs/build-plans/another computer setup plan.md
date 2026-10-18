# Another Computer Setup Plan

Getting the Hauck Marketing Lab repo, and optionally the agent runner, working on a second Windows PC.

## Already done (nothing to move by hand)

- Everything is on GitHub `main`: the app, the agent runner, the four copy skills (`projects/agent-runner/agents/copy/`), the vault.
- The app is live at app.hauckmarketing.com. Using the app needs no setup at all.

## Step 1: Get the repo

1. Install Git, Node.js 24 or newer, and pnpm (`npm install -g pnpm`).
2. Clone the repo, or open the existing copy and pull:
   ```
   git pull
   ```
3. For app work: run `pnpm install` in `apps/command-center`.

## Step 2: Agent runner (only if this PC will run the agents)

Run the agents on ONE computer at a time. Two runners both claim messages and both commit lessons to the vault, which causes git conflicts.

1. On the old PC, stop its runner first:
   ```
   cd projects/agent-runner
   .\install-watcher.ps1 -Uninstall
   ```
2. On the new PC, install Claude Code and log in (`claude`, then sign in). The runner calls `claude -p` on your subscription.
3. Install the Doppler CLI and log in, so the runner can read `AGENT_RUNNER_SECRET`:
   ```
   doppler login
   ```
4. Install the runner's packages:
   ```
   cd projects/agent-runner
   npm install
   ```
5. Google Drive for desktop must be signed in with the Drive at `G:\My Drive\🌟 Hauck Marketing` (the client folders). If the drive letter differs, set `AGENT_DRIVE_ROOT` to the right path.
6. Start it as a logon task:
   ```
   .\install-watcher.ps1
   .\install-watcher.ps1 -Status
   ```
7. Check `projects/agent-runner/logs/watcher.log` ends with `watching for agent messages on https://app.hauckmarketing.com`.

## Step 3: Check it works

1. Send any agent a message in the app.
2. The log shows `claimed ...` then `finished ...`, and the reply appears in the chat.

## Off switch

Create the file `projects/agent-runner/data/.stop` to pause the runner without uninstalling it.
