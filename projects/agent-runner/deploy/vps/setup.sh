#!/bin/sh
# Setup of the agent runner on the VPS, safe to re-run. As root:
#   sh /srv/hauck/repo/projects/agent-runner/deploy/vps/setup.sh
#
# Needs, before it runs (README, "VPS"):
#   /srv/hauck/repo                  the repo, cloned with the deploy key in /srv/hauck/ssh
#   /root/hauck-runner/doppler.env   DOPPLER_TOKEN=<read-only service token>
#   /srv/hauck/config/rclone.conf    an rclone remote named "gdrive"
set -eu

C=hermes-agent-jz7z-hermes-agent-1
HERMES_DIR=/docker/hermes-agent-jz7z
KEYS=/root/hauck-runner/profile-keys.env
HERE=$(cd "$(dirname "$0")" && pwd)
AGENTS="manager csm research ghl ads"

mkdir -p /root/hauck-runner /srv/hauck/runner /srv/hauck/config
chmod 700 /root/hauck-runner
touch "$KEYS"
chmod 600 "$KEYS"

# Each profile: its own API key (in its .env, where Hermes reads it) and its
# own MCP token for the runner's tools. Made once, kept after.
for a in $AGENTS; do
  U=$(echo "$a" | tr a-z A-Z)
  [ -d "$HERMES_DIR/data/profiles/$a" ] || docker exec -u hermes $C hermes profile create "$a" --clone --no-alias
  if ! grep -q "^HERMES_KEY_$U=" "$KEYS"; then
    K=$(openssl rand -hex 32)
    sed -i "/^API_SERVER_KEY=/d" "$HERMES_DIR/data/profiles/$a/.env"
    echo "API_SERVER_KEY=$K" >> "$HERMES_DIR/data/profiles/$a/.env"
    echo "HERMES_KEY_$U=$K" >> "$KEYS"
  fi
  grep -q "^HERMES_MCP_TOKEN_$U=" "$KEYS" || echo "HERMES_MCP_TOKEN_$U=$(openssl rand -hex 32)" >> "$KEYS"
done

# The gateway serves every profile at /p/<name>/, listening on the Docker
# network (the port is not published; traefik fronts only the dashboard).
grep -q "^gateway:" "$HERMES_DIR/data/config.yaml" || printf "gateway:\n  multiplex_profiles: true\n" >> "$HERMES_DIR/data/config.yaml"
grep -q "^API_SERVER_HOST=" "$HERMES_DIR/data/.env" || echo "API_SERVER_HOST=0.0.0.0" >> "$HERMES_DIR/data/.env"

# Profiles' tools, MCP entry and SOUL.md, from inside the Hermes container.
TMP="$HERMES_DIR/data/.hauck-setup"
rm -rf "$TMP" && mkdir -p "$TMP"
cp "$KEYS" "$TMP/tokens.env"
cp -r "$HERE/../../agents" "$TMP/agents"
cp "$HERE/profiles.py" "$TMP/profiles.py"
chown -R 10000:10000 "$TMP"
docker exec -u hermes $C /opt/hermes/.venv/bin/python /opt/data/.hauck-setup/profiles.py /opt/data/.hauck-setup/tokens.env /opt/data/.hauck-setup/agents
rm -rf "$TMP"

# Shared folders, owned by the uid both containers run as.
mkdir -p "$HERMES_DIR/data/work" "$HERMES_DIR/data/drive"
chown -R 10000:10000 "$HERMES_DIR/data/work" "$HERMES_DIR/data/drive" /srv/hauck/repo /srv/hauck/config

(cd "$HERMES_DIR" && docker compose restart)
cp "$HERE/Dockerfile" "$HERE/docker-compose.yml" /srv/hauck/runner/
(cd /srv/hauck/runner && docker compose up -d --build)
echo "done: docker logs -f hauck-agent-runner"
