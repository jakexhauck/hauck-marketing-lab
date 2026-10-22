# Sets up the five agent profiles in Hermes. Run INSIDE the Hermes container
# as the hermes user, by setup.sh:
#   /opt/hermes/.venv/bin/python profiles.py <tokens env file> <agents dir> <skills.json> <skills dir>
#
# Idempotent. For each profile it sets the tools Hermes may give it over the
# API (no terminal, no file tools, no code execution, no browser), points its
# "hauck" MCP server at the runner with that profile's own token, and writes a
# short SOUL.md. Each turn's full instructions come from the runner as the
# system message; SOUL.md is who the agent is when nothing else says (a text
# message to the Manager, later).

import json
import os
import shutil
import sys

# Hermes's venv has ruamel, not PyYAML; hermes_yaml wraps it with the same
# safe_load/safe_dump and is what Hermes itself writes its config with.
sys.path.insert(0, "/opt/hermes")
import hermes_yaml as yaml  # noqa: E402

HOME = "/opt/data/profiles"
BRAIN = ["memory", "session_search", "skills", "todo"]
# Never Hermes's own "file" toolset: it reads anything the hermes user can,
# every profile's keys and tokens included. Files come from the hauck MCP
# tools instead, locked to the turn's work and Drive folders (mcpBridge.ts).
TOOLSETS = {
    "manager": BRAIN + ["mcp-hauck"],
    "csm": BRAIN + ["mcp-hauck"],
    "research": BRAIN + ["web", "mcp-hauck"],
    "ghl": BRAIN + ["mcp-hauck"],
    # Not answered on Hermes until Phase 2; set up now so its brain can start.
    "ads": BRAIN + ["web", "mcp-hauck"],
}
NAMES = {
    "manager": "Manager Agent",
    "csm": "Customer Success Manager",
    "research": "Market Research Agent",
    "ghl": "GHL Agent",
    "ads": "Ads Agent",
}
MCP_URL = "http://hauck-agent-runner:8700/mcp"
# Our skills live in their own category folder, so a re-run replaces exactly
# them and never touches what Hermes seeded or what an agent made itself.
OURS = "hauck"
# Caveman shortens the chat reply and nothing else. Its own rules already exempt
# anything persisted; the line says so again in our words.
CAVEMAN = (
    "In chat replies use the caveman skill's voice: answer first, short, no ceremony. "
    "Never for cards, the brief, lessons, requests to other agents, or anything a client will read."
)


def skill_name(skill_md):
    with open(skill_md, encoding="utf-8") as f:
        head = f.read(4000)
    for line in head.splitlines()[1:]:
        if line.strip() == "---":
            break
        if line.startswith("name:"):
            return line.split(":", 1)[1].strip().strip("\"'")
    return os.path.basename(os.path.dirname(skill_md))


def install_skills(d, agent, manifest, staged):
    """Copy this agent's pinned skills in, then switch off every other skill
    except the keep list: an agent reads the name and description of every
    enabled skill on every turn, so 53 it never uses cost on each one."""
    ours = os.path.join(d, "skills", OURS)
    shutil.rmtree(ours, ignore_errors=True)
    mine = []
    for src, path in manifest["install"].get(agent, []):
        dest = os.path.join(ours, os.path.basename(path))
        shutil.copytree(os.path.join(staged, src, path), dest)
        mine.append(skill_name(os.path.join(dest, "SKILL.md")))
    off = set()
    for root, _dirs, files in os.walk(os.path.join(d, "skills")):
        if "SKILL.md" in files and not root.startswith(ours):
            name = skill_name(os.path.join(root, "SKILL.md"))
            if name not in manifest["keep"]:
                off.add(name)
    return mine, sorted(off - set(mine))


def read_env(path):
    out = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                out[k] = v
    return out


def main():
    tokens = read_env(sys.argv[1])
    agents_dir = sys.argv[2]
    with open(sys.argv[3]) as f:
        manifest = json.load(f)
    staged = sys.argv[4]
    for agent, toolsets in TOOLSETS.items():
        d = os.path.join(HOME, agent)
        if not os.path.isdir(d):
            sys.exit(f"profile {agent} is missing: hermes profile create {agent} --clone")
        token = tokens.get(f"HERMES_MCP_TOKEN_{agent.upper()}")
        if not token:
            sys.exit(f"no HERMES_MCP_TOKEN_{agent.upper()} in {sys.argv[1]}")
        cfg_path = os.path.join(d, "config.yaml")
        with open(cfg_path) as f:
            cfg = yaml.safe_load(f) or {}
        cfg.setdefault("platform_toolsets", {})["api_server"] = toolsets
        mine, off = install_skills(d, agent, manifest, staged)
        cfg.setdefault("skills", {})["disabled"] = off
        servers = cfg.setdefault("mcp_servers", {})
        servers["hauck"] = {"url": MCP_URL, "headers": {"Authorization": f"Bearer {token}"}}
        with open(cfg_path, "w") as f:
            # A wide line so a token is never folded across two lines.
            yaml.safe_dump(cfg, f, sort_keys=False, allow_unicode=True, width=2**31 - 1)

        role = ""
        role_file = os.path.join(agents_dir, f"{agent}.md")
        if os.path.exists(role_file):
            with open(role_file) as f:
                role = f.read().strip()
        with open(os.path.join(d, "SOUL.md"), "w") as f:
            f.write(
                f"You are the {NAMES[agent]} at Hauck Marketing, working for Jake. "
                "Address him as Sir. Calm, precise, plain English, short sentences. "
                "Talk like a colleague texting him: 1 to 3 short sentences by default, "
                "answer first, no headings, no preamble, long work goes on a card. "
                "Never use em dashes. You keep your own memory across conversations: "
                "save what you learn about each client under that client's name.\n\n"
                + (CAVEMAN + "\n\n" if "caveman" in mine else "")
                + f"{role}\n"
            )
        print(f"{agent}: {', '.join(toolsets)}; skills {', '.join(mine) or 'none'}; {len(off)} others off")


main()
