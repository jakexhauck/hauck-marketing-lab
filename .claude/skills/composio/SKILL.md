---
name: composio
description: Use when writing, editing, or debugging code that integrates with Composio — the agent platform exposing 1000+ OAuth-managed SaaS tools (Gmail, Slack, GitHub, Notion, Linear, Stripe, Google Calendar) for AI agents. Triggers on imports of `composio` / `@composio/core` / `composio_anthropic` / `composio_openai` / `composio-claude` / `@composio/anthropic`, edits to files matching `**/composio*`, and phrases like "use Composio", "Composio MCP", "add Composio to Claude Code", "connect Gmail/Slack/GitHub to my agent", "Composio toolkit", "auth config", "connected account", plus uppercase Composio tool slugs (`GMAIL_SEND_EMAIL`, `GITHUB_CREATE_ISSUE`, `SLACK_SENDS_MESSAGE`, `NOTION_CREATE_PAGE`). Enforces the current v3 SDK shape — `pip install composio` / `npm install @composio/core` (NOT deprecated `composio-core`), `composio.create(user_id)` → `session.tools()` (NOT renamed `entity_id`), dedicated provider packages like `AnthropicProvider()` (not `provider="anthropic"` strings), hosted streamable-HTTP MCP at `https://backend.composio.dev/v3/mcp/<id>?user_id=<uid>` via `claude mcp add --transport http ... --headers "X-API-Key:..."` (no stdio MCP package exists), and Tool Router (`toolkits=["composio"]`) as the default for broad use vs single-toolkit MCP for focused workflows.
---

# Composio

Composio is the integration + auth layer for AI agents: a managed catalog of 1000+ third-party SaaS APIs (Gmail, Slack, GitHub, Notion, Linear, Stripe, Salesforce, Google Calendar, etc.) exposed as LLM-ready tools, with hosted OAuth, per-user credential isolation, and a hosted MCP layer. You wire it into either an LLM SDK (Anthropic, OpenAI, Vercel AI, …) or directly into Claude Code via MCP.

Docs root: <https://docs.composio.dev>. Dashboard: <https://platform.composio.dev>.

## When to Use This Skill

Use this skill when the user:

- Writes or edits code that imports `composio`, `@composio/core`, `composio_anthropic`, `composio_openai`, `composio-claude`, or any `@composio/*` package.
- Asks to "use Composio", set up Composio MCP, "connect Gmail/Slack/GitHub" to their agent or to Claude Code, configure an auth config, or work with connected accounts.
- Mentions a Composio tool slug (uppercase + underscores: `GMAIL_SEND_EMAIL`, `GITHUB_CREATE_ISSUE`, `SLACK_SENDS_MESSAGE`, etc.).
- Pastes Composio errors (`no connection found`, `require_mcp_api_key`, 401 on `backend.composio.dev`).

Do **not** use this skill for raw MCP server authoring (no Composio in the loop), generic OAuth flows, or n8n / Zapier / Pipedream questions — those are different platforms.

## Hard Rules (Don't Violate)

1. **Use the v3 SDK packages, not v2.** Python: `pip install composio`. TypeScript: `npm install @composio/core`. The legacy `composio-core` package (both Py and npm) is v2 and deprecated. If you find it in `requirements.txt` / `package.json`, propose an upgrade.
2. **Use `user_id`, not `entity_id`.** `entity_id` was renamed in v3. Old tutorials still use it. Convert silently when porting.
3. **Use dedicated provider packages, not provider strings.** `Composio(provider=AnthropicProvider())` — there is no `provider="anthropic"` string parameter. The provider class shapes the tool schema; mismatch → silent breakage.
4. **MCP transport is HTTP, not stdio.** There is no `npx @modelcontextprotocol/server-composio` package. The only supported transport is hosted streamable HTTP at `https://backend.composio.dev/v3/mcp/<server_id>?user_id=<uid>`, registered with `claude mcp add --transport http`.
5. **Tool slugs are case-sensitive UPPERCASE_WITH_UNDERSCORES.** `GMAIL_SEND_EMAIL` works; `gmail_send_email` does not.

## SDK Setup (v3)

```bash
# Python
pip install composio                       # core SDK (NOT composio-core)
pip install composio_anthropic anthropic   # for Anthropic API
pip install composio_openai openai         # for OpenAI

# TypeScript
npm install @composio/core
npm install @composio/anthropic @anthropic-ai/sdk
npm install @composio/openai openai
```

Required env: `COMPOSIO_API_KEY` (from <https://platform.composio.dev/settings>) plus the LLM provider's key.

Initialize:

```python
from composio import Composio
from composio_anthropic import AnthropicProvider

composio = Composio(provider=AnthropicProvider())   # picks up COMPOSIO_API_KEY
session = composio.create(user_id="user_123")       # multi-tenant scope
tools = session.tools()                             # list of tool schemas for the LLM
```

```typescript
import { Composio } from "@composio/core";
import { AnthropicProvider } from "@composio/anthropic";

const composio = new Composio({ provider: new AnthropicProvider() });
const session = await composio.create("user_123");
const tools = await session.tools();
```

`user_id` is your app's identifier for the end user. Connected accounts (OAuth tokens) are scoped per `user_id`, so the same `user_id` + API key always resolves to the same set of authorized integrations.

## Fetching Tools

Three filters: by toolkit, by exact slug, or by semantic search. Always pass `user_id`.

```python
# By toolkit (recommended for focused workflows)
tools = composio.tools.get(user_id, toolkits=["GITHUB", "GMAIL"], limit=10)

# By exact slug
tools = composio.tools.get(user_id, tools=["GMAIL_SEND_EMAIL", "GITHUB_CREATE_ISSUE"])

# Semantic search
tools = composio.tools.get(user_id, search="create calendar event", toolkits=["GOOGLECALENDAR"])

# Tool Router (dynamic loading across all connected toolkits)
tools = composio.tools.get(user_id, toolkits=["composio"])   # the meta-toolkit
```

**Default to the Tool Router (`toolkits=["composio"]`) for broad assistants** — it loads tools dynamically based on the prompt, avoiding the context bloat from passing 1000+ schemas. Use single-toolkit filters when the workflow is narrow (a Gmail agent, a GitHub bot).

## Wiring Composio to Anthropic / Claude

`AnthropicProvider` shapes tool schemas for the Anthropic SDK and exposes `handle_tool_calls`, which runs every `tool_use` block from a response and returns results ready to feed back.

```python
import json, anthropic
from composio import Composio
from composio_anthropic import AnthropicProvider

composio = Composio(provider=AnthropicProvider())
client = anthropic.Anthropic()

session = composio.create(user_id="user_123")
tools = session.tools()

messages = [{"role": "user", "content": "Email john@x.com saying hi"}]
response = client.messages.create(
    model="claude-opus-4-7",
    max_tokens=4096,
    tools=tools,
    messages=messages,
)

while response.stop_reason == "tool_use":
    results = composio.provider.handle_tool_calls(user_id="user_123", response=response)
    tool_uses = [b for b in response.content if b.type == "tool_use"]
    messages.append({"role": "assistant", "content": response.content})
    messages.append({"role": "user", "content": [
        {"type": "tool_result", "tool_use_id": tu.id, "content": json.dumps(r)}
        for tu, r in zip(tool_uses, results)
    ]})
    response = client.messages.create(
        model="claude-opus-4-7", max_tokens=4096, tools=tools, messages=messages,
    )

print("".join(b.text for b in response.content if b.type == "text"))
```

TypeScript mirrors this with `composio.provider.handleToolCalls(userId, response)`.

> **Anthropic SDK vs Claude Agent SDK.** `composio_anthropic` / `@composio/anthropic` is for the **Anthropic API** (`anthropic.messages.create`). For the **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`, used to build subagents) install `composio-claude` / `ClaudeProvider()` instead. They are different packages.

## Wiring Composio to OpenAI

```python
from openai import OpenAI
from composio import Composio
from composio_openai import OpenAIProvider

composio = Composio(provider=OpenAIProvider())
client = OpenAI()
session = composio.create(user_id="user_123")
tools = session.tools()

messages = [{"role": "user", "content": "Send a Slack DM to @alice"}]
response = client.chat.completions.create(model="gpt-5.2", tools=tools, messages=messages)

while response.choices[0].message.tool_calls:
    results = composio.provider.handle_tool_calls(response=response, user_id="user_123")
    messages.append(response.choices[0].message)
    for tc, r in zip(response.choices[0].message.tool_calls, results):
        messages.append({"role": "tool", "tool_call_id": tc.id, "content": json.dumps(r)})
    response = client.chat.completions.create(model="gpt-5.2", tools=tools, messages=messages)
```

## Direct Tool Execution (No LLM)

When the user just wants to call a SaaS API from a script, skip the LLM:

```python
result = composio.tools.execute(
    "GMAIL_SEND_EMAIL",
    user_id="user_123",
    arguments={"recipient_email": "john@x.com", "subject": "Hi", "body": "Hello"},
)
```

```typescript
const result = await composio.tools.execute("GMAIL_SEND_EMAIL", {
  userId: "user_123",
  arguments: { recipient_email: "john@x.com", subject: "Hi", body: "Hello" },
});
```

Note the parameter shape difference: Python uses kwargs, TS uses an options object with camelCase (`userId`).

## Connecting a User Account (OAuth)

Three concepts:

- **Auth Config** — toolkit-wide blueprint (OAuth client + scopes). Created once in the dashboard or via SDK; produces an `auth_config_id` like `ac_xxx`.
- **User ID** — your app's identifier for the end user.
- **Connected Account** — the resulting per-user credential, with status `INITIATED` → `ACTIVE` → (`EXPIRED` / `FAILED`).

```python
req = composio.connected_accounts.link(
    user_id="user_123",
    auth_config_id="ac_xxx",
    callback_url="https://myapp.com/callback",
)
print(req.redirect_url)                         # send the user here
account = req.wait_for_connection(timeout=120)  # blocks until ACTIVE
```

Only `ACTIVE` connections can execute tools. Always either check first or wrap `tools.execute` in try/except and surface the redirect URL on failure.

## Adding Composio to Claude Code via MCP

Composio's only Claude Code transport is **hosted streamable HTTP** — there is no stdio package.

### 1. Generate an MCP URL with the SDK

```python
import os
from composio import Composio

composio = Composio(api_key=os.environ["COMPOSIO_API_KEY"])
session = composio.create(user_id="me", toolkits=["gmail"])   # or ["composio"] for Tool Router
print(session.mcp.url)
# -> https://backend.composio.dev/v3/mcp/<server_id>?user_id=me
```

### 2. Register with Claude Code

```powershell
# Windows PowerShell
claude mcp add --transport http gmail-composio `
  "https://backend.composio.dev/v3/mcp/<SERVER_ID>?user_id=me" `
  --headers "X-API-Key:$env:COMPOSIO_API_KEY"
```

```bash
# macOS/Linux
claude mcp add --transport http gmail-composio \
  "https://backend.composio.dev/v3/mcp/<SERVER_ID>?user_id=me" \
  --headers "X-API-Key:$COMPOSIO_API_KEY"
```

### 3. Or hand-edit `.mcp.json` (project) / `~/.claude.json` (user)

```json
{
  "mcpServers": {
    "gmail-composio": {
      "type": "http",
      "url": "https://backend.composio.dev/v3/mcp/<SERVER_ID>?user_id=me",
      "headers": { "X-API-Key": "<COMPOSIO_API_KEY>" }
    }
  }
}
```

### 4. Restart and verify

```bash
/exit
claude
claude mcp list
```

### 5. First-call OAuth

The first time Claude calls a tool that needs an unconnected toolkit, the MCP server returns an OAuth URL. Click, consent, retry the prompt — the connection persists server-side, keyed by `user_id`.

## Zero-to-Gmail Walkthrough (Windows 10)

```powershell
# 1. Install SDK
pip install composio

# 2. Set API key (get one from https://platform.composio.dev/settings)
$env:COMPOSIO_API_KEY = "<paste-here>"

# 3. Generate a Gmail-scoped MCP URL
$url = python -c "from composio import Composio; import os; c=Composio(api_key=os.environ['COMPOSIO_API_KEY']); s=c.create(user_id='me', toolkits=['gmail']); print(s.mcp.url)"

# 4. Add to Claude Code
claude mcp add --transport http gmail-composio "$url" --headers "X-API-Key:$env:COMPOSIO_API_KEY"

# 5. Restart and test
/exit
claude
# In Claude: "Read my last 5 unread emails" — click the OAuth URL it returns, consent, retry.
```

## Triggers (Event-Driven Flows)

Composio supports event triggers (`GMAIL_NEW_GMAIL_MESSAGE`, `GITHUB_COMMIT_EVENT`, `SLACK_RECEIVE_MESSAGE`, …) delivered as webhooks or SDK subscriptions.

```python
trigger = composio.triggers.create(
    slug="GMAIL_NEW_GMAIL_MESSAGE",
    user_id="user_123",
    trigger_config={"interval": 15, "labelIds": "INBOX"},   # 15-min minimum on managed auth
)

@composio.triggers.subscribe("GMAIL_NEW_GMAIL_MESSAGE")
def on_email(payload):
    print(payload["data"]["messageText"])

composio.triggers.listen()   # blocks; long-lived websocket
```

## Framework Adapters (Cheat Sheet)

All follow `Composio({ provider: new XProvider() })` → `composio.create(user_id)` → `session.tools()` → hand to the framework.

| Framework | Install | Provider |
|---|---|---|
| Anthropic SDK | `pip install composio_anthropic` / `npm i @composio/anthropic` | `AnthropicProvider` |
| OpenAI SDK | `pip install composio_openai` / `npm i @composio/openai` | `OpenAIProvider` |
| Claude Agent SDK | `pip install composio-claude` | `ClaudeProvider` |
| Vercel AI SDK | `npm i @composio/vercel` | `VercelProvider` |
| LangChain | `pip install composio_langchain` | `LangchainProvider` |
| CrewAI | `pip install composio-crewai` | `CrewAIProvider` |
| LlamaIndex | `pip install composio-llamaindex` | `LlamaIndexProvider` |
| OpenAI Agents | `pip install composio-openai-agents` | `OpenAIAgentsProvider` |
| Mastra | `npm i @composio/mastra` | `MastraProvider` |

## Gotchas

- **Legacy package wins on PATH.** If `composio-core` is installed alongside `composio`, imports may resolve to the v2 surface and silently break. Uninstall the legacy package: `pip uninstall composio-core`.
- **Provider mismatch is silent.** Passing OpenAI-shaped tools to Anthropic (or vice-versa) doesn't error — the LLM just doesn't call them. The `provider=` on `Composio(...)` must match the LLM SDK you're calling.
- **`entity_id` in old tutorials.** Anything pre-2025 calling `entity_id="..."` needs to be rewritten as `user_id="..."` in the v3 SDK.
- **Toolkit version pinning.** In production, pin: `Composio(toolkit_versions={"github": "20251027_00"})`. Use `"latest"` only when an LLM consumes the result.
- **Polling intervals.** Managed-auth polling triggers (e.g. Gmail) enforce a 15-minute minimum. Anything lower is rejected.
- **Composio CLI on Windows.** The `curl | bash` install is not supported on native Windows; the `npm install -g @composio/cli` referenced in some older docs returns 404. **Skip the CLI on Windows** — use the Python SDK or run the CLI inside WSL2. The CLI is not required to use Composio MCP.
- **MCP `X-API-Key` is required** for new orgs (default since March 2026). A 401 with `require_mcp_api_key` means you forgot the `--headers` flag. Header name is case-insensitive.
- **MCP URL freshness.** Treat the generated MCP URL as long-lived but not eternal — if calls start failing with auth errors, regenerate via `session.mcp.url` and re-add to Claude Code.
- **Tool Router vs single-toolkit.** Default to Tool Router (`toolkits=["composio"]`) for broad assistants; switch to single-toolkit MCP when the workflow is narrow and you want a smaller, predictable tool surface.
- **Stripe / billing-sensitive tools** count as "premium" (~3× cost). The premium list lives at <https://docs.composio.dev/toolkits/premium-tools>.

## Reference URLs

- Quickstart: <https://docs.composio.dev/docs/quickstart>
- Authenticating tools: <https://docs.composio.dev/docs/authenticating-tools>
- Fetching / executing tools: <https://docs.composio.dev/docs/fetching-tools>, <https://docs.composio.dev/docs/executing-tools>
- Provider docs: <https://docs.composio.dev/providers/anthropic>, <https://docs.composio.dev/providers/openai>, <https://docs.composio.dev/providers/vercel>
- MCP overview: <https://docs.composio.dev/docs/mcp-overview>
- Toolkit catalog: <https://docs.composio.dev/toolkits>
- Changelog: <https://docs.composio.dev/docs/changelog>
- Dashboard / API key: <https://platform.composio.dev/settings>
