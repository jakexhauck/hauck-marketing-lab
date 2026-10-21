import { describe, expect, it } from "vitest";
import { appTools } from "../src/appOps.ts";

function recorder(status = 200, text = '{"ok":true}') {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(text, { status });
  }) as typeof fetch;
  return { calls, impl };
}

describe("appTools", () => {
  it("posts a GHL op with the secret to the runner endpoint", async () => {
    const r = recorder();
    const t = appTools({ base: "https://app.example.com/", secret: "s3cret", fetch: r.impl });
    expect(await t.ghl({ messageId: "M", tenantId: "T", op: "read.pipelines", args: {} })).toBe('{"ok":true}');
    expect(r.calls[0].url).toBe("https://app.example.com/api/agent-runner/ghl");
    expect((r.calls[0].init?.headers as Record<string, string>)["x-agent-runner-secret"]).toBe("s3cret");
    expect(JSON.parse(String(r.calls[0].init?.body))).toEqual({ messageId: "M", tenantId: "T", op: "read.pipelines", args: {} });
  });

  it("reads Meta numbers with a GET", async () => {
    const r = recorder();
    await appTools({ base: "https://a", secret: "s", fetch: r.impl }).meta({ tenant: "T 1", level: "ad", days: 14 });
    expect(r.calls[0].url).toBe("https://a/api/agent-runner/meta?tenant=T+1&level=ad&days=14");
    expect(r.calls[0].init?.method).toBeUndefined();
  });

  it("passes the app's refusal on as the error", async () => {
    const r = recorder(403, '{"error":"Jake did not ask for this write"}');
    await expect(appTools({ base: "https://a", secret: "s", fetch: r.impl }).ghl({ messageId: "M", tenantId: "T", op: "write.tag", args: {} })).rejects.toThrow(
      /ghl 403: .*did not ask/,
    );
  });
});
