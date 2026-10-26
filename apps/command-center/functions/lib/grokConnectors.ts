import { GHL_TOOLS } from "./grokGhl";
import { META_TOOLS } from "./grokMeta";
import type { GrokConnector, GrokDeps, ServerInfo, ToolDef } from "./grokMcp";

// One Grok custom connector per system, each at /api/grok/<name>/<GROK_MCP_KEY>.
export const CONNECTORS: Record<GrokConnector, { server: ServerInfo; tools: ToolDef<GrokDeps>[] }> = {
  ghl: {
    server: { name: "hauck-ghl", instructions: "GoHighLevel API v2 for Hauck Marketing's agency and every client sub-account." },
    tools: GHL_TOOLS,
  },
  meta: {
    server: { name: "hauck-meta", instructions: "Meta Ads for Hauck Marketing's clients: results, structure, and paused builds." },
    tools: META_TOOLS,
  },
};
