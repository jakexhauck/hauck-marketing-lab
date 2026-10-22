# The agent runner on the VPS (docs/build-plans/hermes-agents.md, Task 6).
#
# Only the tools: the runner's code is the repo clone mounted at /repo, so an
# update is a git pull and a restart, never a rebuild. Runs as uid 10000, the
# Hermes container's user, because both write the shared work and Drive folders.

FROM node:24-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends git openssh-client ca-certificates curl gnupg rclone \
 && curl -Ls --tlsv1.2 --proto "=https" https://cli.doppler.com/install.sh | sh \
 && apt-get purge -y gnupg && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# YouTube transcripts for the agents' reach tool (webTools.ts). The standalone
# build needs no Python; pinned and checked against the release's own sums.
RUN curl -Ls --tlsv1.2 --proto "=https" -o /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp_linux \
 && echo "58162f9bfdc27458ea47bfcb311cf47028f17d8154a8bf7d689861d46399230a  /usr/local/bin/yt-dlp" | sha256sum -c - \
 && chmod 755 /usr/local/bin/yt-dlp

# The Ads Agent's landing pages deploy from here (pages.ts). wrangler reads
# CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID from the Doppler environment.
RUN npm install -g wrangler@4.91.0 --no-audit --no-fund --loglevel=error

RUN groupadd -g 10000 runner && useradd -u 10000 -g 10000 -m -d /home/runner runner
USER runner
WORKDIR /repo/projects/agent-runner

# npm ci on every start: the clone's lockfile may have moved with a pull.
# doppler run puts this project's prd secrets (AGENT_RUNNER_SECRET among them)
# into the runner's environment. No agent runs in this container.
CMD ["sh", "-c", "npm ci --no-audit --no-fund --loglevel=error && exec doppler run -- npx tsx src/main.ts"]
