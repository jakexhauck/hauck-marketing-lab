// Sign the runner in to Higgsfield, once (docs/build-plans/hermes-ads.md).
//
//   npx tsx src/higgsfieldLogin.ts [file]      default /config/higgsfield.json
//
// Device sign-in, so it works on the VPS with no browser: it prints a link and
// a code, Jake opens the link on any device, signs in to Higgsfield and
// approves, and the login is saved where only the runner can read it
// (higgsfield.ts). The client is registered on first use and kept in the same
// file, so signing in again later reuses it.

import { HF_TOKEN_URL, fileStore, loginFrom } from "./higgsfield.ts";

const AUTH = "https://clerk.higgsfield.ai";
const SCOPE = "openid email offline_access";
const RESOURCE = "https://mcp.higgsfield.ai/mcp";
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

const file = process.argv[2] ?? "/config/higgsfield.json";
const store = fileStore(file);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function form(url: string, body: Record<string, string>): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(30_000),
  });
  return { ok: res.ok, status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

async function register(): Promise<string> {
  const res = await fetch(`${AUTH}/oauth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Hauck agent runner",
      grant_types: [DEVICE_GRANT, "refresh_token"],
      token_endpoint_auth_method: "none",
      scope: SCOPE,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const v = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof v.client_id !== "string") throw new Error(`client registration failed (${res.status}): ${JSON.stringify(v).slice(0, 300)}`);
  return v.client_id;
}

async function main(): Promise<void> {
  const clientId = store.read()?.clientId ?? (await register());
  const dev = await form(`${AUTH}/oauth/device_authorization`, { client_id: clientId, scope: SCOPE, resource: RESOURCE });
  if (!dev.ok) throw new Error(`device sign-in refused (${dev.status}): ${JSON.stringify(dev.json).slice(0, 300)}`);
  const d = dev.json as { device_code: string; user_code: string; verification_uri: string; verification_uri_complete?: string; interval?: number; expires_in?: number };
  console.log(`Open: ${d.verification_uri_complete ?? d.verification_uri}`);
  console.log(`Code: ${d.user_code}`);
  let wait = (d.interval ?? 5) * 1000;
  const until = Date.now() + (d.expires_in ?? 900) * 1000;
  while (Date.now() < until) {
    await sleep(wait);
    const t = await form(HF_TOKEN_URL, { grant_type: DEVICE_GRANT, device_code: d.device_code, client_id: clientId });
    if (t.ok) {
      store.write(loginFrom(clientId, t.json, Date.now()));
      console.log(`Signed in. Saved to ${file}`);
      return;
    }
    const err = String(t.json.error ?? "");
    if (err === "authorization_pending") continue;
    if (err === "slow_down") {
      wait += 5000;
      continue;
    }
    throw new Error(`sign-in failed: ${err || t.status}`);
  }
  throw new Error("the code expired before it was approved; run this again");
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
