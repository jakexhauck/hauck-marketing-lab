# Sets up the five agent profiles in Hermes. Run INSIDE the Hermes container
# as the hermes user, by setup.sh:
#   /opt/hermes/.venv/bin/python profiles.py <tokens env file> <agents dir>
#
# Idempotent. For each profile it sets the tools Hermes may give it over the
# API (no terminal, no code execution, no browser for anyone), points its
# "hauck" MCP server at the runner with that profile's own token, and writes a
# short SOUL.md. Each turn's full instructions come from the runner as the
# system message; SOUL.md is who the agent is when nothing else says (a text
# message to the Manager, later).

import os
import sys

import yaml

HOME = "/opt/data/profiles"
BRAIN = ["memory", "session_search", "skills", "todo"]
TOOLSETS = {
    "manager": BRAIN + ["file", "mcp-hauck"],
    "csm": BRAIN + ["file", "mcp-hauck"],
    "research": BRAIN + ["file", "web"],
    "ghl": BRAIN + ["mcp-hauck"],
    # Not answered on Hermes until Phase 2; set up now so its brain can start.
    "ads": BRAIN + ["file", "web", "mcp-hauck"],
}
NAMES = {
    "manager": "Manager Agent",
    "csm": "Customer Success Manager",
    "research": "Market Research Agent",
    "ghl": "GHL Agent",
    "ads": "Ads Agent",
}
MCP_URL = "http://hauck-agent-runner:8700/mcp"


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
        servers = cfg.setdefault("mcp_servers", {})
        if "mcp-hauck" in toolsets:
            servers["hauck"] = {"url": MCP_URL, "headers": {"Authorization": f"Bearer {token}"}}
        else:
            servers.pop("hauck", None)
        with open(cfg_path, "w") as f:
            yaml.safe_dump(cfg, f, sort_keys=False, allow_unicode=True)

        role = ""
        role_file = os.path.join(agents_dir, f"{agent}.md")
        if os.path.exists(role_file):
            with open(role_file) as f:
                role = f.read().strip()
        with open(os.path.join(d, "SOUL.md"), "w") as f:
            f.write(
                f"You are the {NAMES[agent]} at Hauck Marketing, working for Jake. "
                "Address him as Sir. Calm, precise, plain English, short sentences. "
                "Never use em dashes. You keep your own memory across conversations: "
                "save what you learn about each client under that client's name.\n\n"
                f"{role}\n"
            )
        print(f"{agent}: {', '.join(toolsets)}")


main()
