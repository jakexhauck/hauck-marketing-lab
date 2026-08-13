import type { Env } from "./env";
import { getServiceClient } from "./supabase";
import { graphGet } from "./metaGraph";

// The agency Meta System User token: where it lives, and how it is proven.
//
// Two homes, in this order:
//
//   1. The agency_meta row (0106). Written by the Paid Ads wizard, read on every
//      request, live the moment it saves.
//   2. env.META_SYSTEM_USER_TOKEN, bound at deploy. The bootstrap, and the
//      fallback for anything running before a token was ever pasted.
//
// The stored one wins, and that ordering is the whole point. Cloudflare binds
// environment variables at deploy time and this deployment can neither write
// Doppler nor redeploy itself, so an env var is a value only a deploy can
// change. Ranking it above the box would mean pasting a token, being told it
// saved, and watching nothing happen: exactly the failure the box exists to
// remove. The same shape as resolveAdAccount, where a client's own account
// beats the global fallback.
//
// Rotating a dead token is therefore always possible from the app, and clearing
// the row falls back to whatever the deploy carries.

async function storedToken(env: Env): Promise<string | null> {
  const client = getServiceClient(env);
  if (!client) return null;
  const { data } = await client
    .from("agency_meta")
    .select("system_user_token")
    .eq("id", true)
    .maybeSingle();
  const stored = ((data as { system_user_token?: string } | null)?.system_user_token ?? "").trim();
  return stored || null;
}

/** The token to use for Meta calls, or null when the agency has none. */
export async function resolveMetaToken(env: Env): Promise<string | null> {
  const saved = await storedToken(env);
  if (saved) return saved;
  return (env.META_SYSTEM_USER_TOKEN ?? "").trim() || null;
}

/** Where the token in play came from, for the panel that reports on it. */
export async function metaTokenSource(env: Env): Promise<"env" | "database" | null> {
  if (await storedToken(env)) return "database";
  return (env.META_SYSTEM_USER_TOKEN ?? "").trim() ? "env" : null;
}

/**
 * Ask Meta whether a token works before trusting it. A token is only a string
 * until something answers with it, and saving a dead one turns "connected" into
 * a lie that surfaces days later as an empty dashboard.
 *
 * Returns the number of ad accounts it can see, which is also the number that
 * matters straight afterwards: zero means the token is real but has been
 * granted nothing.
 */
export async function verifyMetaToken(
  token: string,
): Promise<{ ok: true; accounts: number } | { ok: false; error: string }> {
  try {
    const res = await graphGet(token, "/me/adaccounts", { fields: "account_id", limit: "50" });
    const rows = (res.data as unknown[]) ?? [];
    return { ok: true, accounts: rows.length };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    // Meta's errors arrive as a JSON blob inside the message. The human-readable
    // sentence inside it is worth more than the whole envelope.
    const match = raw.match(/"message"\s*:\s*"([^"]+)"/);
    return { ok: false, error: match?.[1] ?? raw.slice(0, 200) };
  }
}

/** Store the token. Overwrites the single row; there is only ever one. */
export async function saveMetaToken(
  env: Env,
  token: string,
  adminId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const client = getServiceClient(env);
  if (!client) return { ok: false, error: "No database connection." };
  const { error } = await client.from("agency_meta").upsert(
    {
      id: true,
      system_user_token: token,
      updated_by: adminId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (!error) return { ok: true };
  // The one failure worth translating: the table has not been created yet.
  // Postgres says "relation \"agency_meta\" does not exist", which reads as a
  // bug rather than as the one command that fixes it.
  if (/agency_meta/.test(error.message) && /does not exist|schema cache/.test(error.message)) {
    return {
      ok: false,
      error: "The database has not had migration 0106 applied yet, so there is nowhere to save it.",
    };
  }
  return { ok: false, error: error.message };
}

/** Enough tail to recognise which token is loaded, never enough to use it. */
export function maskToken(token: string | null): string | null {
  if (!token) return null;
  return token.length <= 6 ? "••••" : `••••${token.slice(-6)}`;
}
