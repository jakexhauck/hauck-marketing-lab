// The MCP bridge's way to the app (mcpBridge.ts): the same endpoints
// bin/ghl.mjs and bin/meta.mjs call, with the runner's secret, which stays in
// this process. The app's answer comes back as text either way, and a refusal
// (a write Jake did not ask for, say) is the app's message, so the agent can
// say why.

import type { Higgsfield } from "./higgsfield.ts";
import type { AppTools } from "./mcpBridge.ts";

export function appTools(o: { base: string; secret: string; fetch?: typeof fetch; higgsfield?: Higgsfield }): AppTools {
  const base = o.base.replace(/\/+$/, "");
  const f = o.fetch ?? fetch;
  async function answer(label: string, res: Response): Promise<string> {
    const text = await res.text();
    if (!res.ok) throw new Error(`${label} ${res.status}: ${text.slice(0, 500)}`);
    return text;
  }
  return {
    higgsfield: o.higgsfield,
    async ghl(body) {
      const res = await f(`${base}/api/agent-runner/ghl`, {
        method: "POST",
        headers: { "x-agent-runner-secret": o.secret, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
      return answer("ghl", res);
    },
    async metaOps(body) {
      const res = await f(`${base}/api/agent-runner/meta-ops`, {
        method: "POST",
        headers: { "x-agent-runner-secret": o.secret, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
      return answer("meta-ops", res);
    },
    async meta(q) {
      const qs = new URLSearchParams({ tenant: q.tenant, level: q.level, days: String(q.days) });
      const res = await f(`${base}/api/agent-runner/meta?${qs}`, {
        headers: { "x-agent-runner-secret": o.secret },
        signal: AbortSignal.timeout(60_000),
      });
      return answer("meta", res);
    },
  };
}
