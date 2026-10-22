// Sign the runner in to Higgsfield, once (docs/build-plans/hermes-ads.md).
//
//   npx tsx src/higgsfieldLogin.ts [file]              device sign-in (default file /config/higgsfield.json)
//   npx tsx src/higgsfieldLogin.ts --browser <file>    browser sign-in on a machine with one
//
// Device sign-in works on the VPS with no browser: it prints a link and a code,
// Jake opens the link on any device, signs in to Higgsfield and approves.
// Where Higgsfield will not do that for this client, --browser runs the usual
// sign-in on the PC (a page opens, Jake approves, it comes back to a local
// port) and the file it writes is copied to the VPS. Either way the login ends
// up where only the runner can read it (higgsfield.ts). The client is
// registered on first use and kept in the same file, so signing in again
// later reuses it.

import { exec } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { HF_TOKEN_URL, fileStore, loginFrom } from "./higgsfield.ts";

const AUTH = "https://clerk.higgsfield.ai";
const SCOPE = "openid email offline_access";
const RESOURCE = "https://mcp.higgsfield.ai/mcp";
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}/callback`;

const args = process.argv.slice(2);
const browser = args.includes("--browser");
const file = args.find((a) => !a.startsWith("--")) ?? "/config/higgsfield.json";
const store = fileStore(file);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

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
      redirect_uris: [REDIRECT],
      grant_types: ["authorization_code", DEVICE_GRANT, "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: SCOPE,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const v = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof v.client_id !== "string") throw new Error(`client registration failed (${res.status}): ${JSON.stringify(v).slice(0, 300)}`);
  return v.client_id;
}

async function device(clientId: string): Promise<void> {
  const dev = await form(`${AUTH}/oauth/device_authorization`, { client_id: clientId, scope: SCOPE, resource: RESOURCE });
  if (!dev.ok) throw new Error(`device sign-in refused (${dev.status}): ${JSON.stringify(dev.json).slice(0, 300)}. Use --browser on the PC instead.`);
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

// Authorization code with PKCE, back to a one-shot local server.
async function viaBrowser(clientId: string): Promise<void> {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state = b64url(randomBytes(16));
  const url = `${AUTH}/oauth/authorize?${new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    scope: SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: RESOURCE,
  })}`;
  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const u = new URL(req.url ?? "/", REDIRECT);
      if (u.pathname !== "/callback") return void res.writeHead(404).end();
      const got = u.searchParams.get("code");
      const ok = got && u.searchParams.get("state") === state;
      res.writeHead(ok ? 200 : 400, { "content-type": "text/plain" }).end(ok ? "Signed in. You can close this tab." : "Sign-in failed. Close this tab and try again.");
      server.close();
      if (ok) resolve(got!);
      else reject(new Error(`sign-in failed: ${u.searchParams.get("error") ?? "bad answer"}`));
    });
    server.listen(PORT, "127.0.0.1", () => {
      console.log(`Open: ${url}`);
      exec(process.platform === "win32" ? `start "" "${url}"` : `xdg-open "${url}"`);
    });
    setTimeout(() => {
      server.close();
      reject(new Error("no sign-in within 10 minutes; run this again"));
    }, 10 * 60_000).unref();
  });
  const t = await form(HF_TOKEN_URL, { grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier, resource: RESOURCE });
  if (!t.ok) throw new Error(`code exchange failed (${t.status}): ${JSON.stringify(t.json).slice(0, 300)}`);
  store.write(loginFrom(clientId, t.json, Date.now()));
}

async function main(): Promise<void> {
  const clientId = store.read()?.clientId ?? (await register());
  await (browser ? viaBrowser(clientId) : device(clientId));
  console.log(`Signed in. Saved to ${file}`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
