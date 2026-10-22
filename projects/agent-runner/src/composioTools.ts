// Composio for the Hermes agents (docs/build-plans/hermes-agent-ops.md,
// Phase 1). Composio connects a thousand apps; an agent gets a handful, by
// name, read or draft only. Nothing here sends an email, books a meeting or
// deletes a file: those stay with Jake, or behind an approved card in the app.
//
// The allowlist is the whole lock. A slug not listed for that agent is refused
// before anything leaves the runner, whatever the model asks for.
//
// Composio scopes each connection by user id. These are the agency's ones as
// they stand in Composio (2026-10-22): Drive on "hauck-agency", the agency
// calendar on "live:hauck-marketing", Jake's Gmail on "jdhauck" (expired that
// day; Jake reconnects it, and until then Gmail calls fail with Composio's
// own reason).

import type { AgentId } from "./wire.ts";

const BASE = "https://backend.composio.dev/api/v3";

// Which Composio user owns the connection a tool runs on, by toolkit prefix.
const USER_FOR: Record<string, string> = {
  GMAIL: "jdhauck",
  GOOGLECALENDAR: "live:hauck-marketing",
  GOOGLEDRIVE: "hauck-agency",
};

export const COMPOSIO_ALLOW: Partial<Record<AgentId, string[]>> = {
  manager: ["GMAIL_FETCH_EMAILS", "GMAIL_CREATE_EMAIL_DRAFT", "GOOGLECALENDAR_EVENTS_LIST", "GOOGLECALENDAR_FIND_FREE_SLOTS", "GOOGLEDRIVE_FIND_FILE"],
  csm: ["GMAIL_CREATE_EMAIL_DRAFT", "GOOGLECALENDAR_FIND_FREE_SLOTS", "GOOGLEDRIVE_FIND_FILE"],
  research: ["GOOGLEDRIVE_FIND_FILE"],
  ads: ["GOOGLEDRIVE_FIND_FILE"],
};

export const composioAllowed = (agent: AgentId): string[] => COMPOSIO_ALLOW[agent] ?? [];

export interface ComposioDeps {
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export async function runComposio(agent: AgentId, slug: string, args: Record<string, unknown>, d: ComposioDeps): Promise<{ text: string; isError: boolean }> {
  if (!composioAllowed(agent).includes(slug)) {
    return { text: `${slug} is not one of your Composio tools. Yours: ${composioAllowed(agent).join(", ") || "none"}`, isError: true };
  }
  const user = USER_FOR[slug.split("_")[0]];
  if (!user) return { text: `no Composio connection is set for ${slug}`, isError: true };
  const f = d.fetchImpl ?? fetch;
  const res = await f(`${BASE}/tools/execute/${encodeURIComponent(slug)}`, {
    method: "POST",
    headers: { "x-api-key": d.apiKey, "content-type": "application/json" },
    body: JSON.stringify({ user_id: user, arguments: args }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await res.text();
  let body: { data?: unknown; successful?: boolean; error?: unknown } = {};
  try {
    body = JSON.parse(raw);
  } catch {
    return { text: `Composio answered ${res.status}: ${raw.slice(0, 300)}`, isError: true };
  }
  // A tool execute answers { data, successful, error } (the proxy's envelope is
  // different; this is not the proxy).
  if (!res.ok || body.successful === false) {
    const why = typeof body.error === "string" ? body.error : JSON.stringify(body.error ?? body).slice(0, 400);
    return { text: `Composio could not run ${slug}: ${why}`, isError: true };
  }
  const text = JSON.stringify(body.data ?? null);
  return { text: text.length > 200_000 ? `${text.slice(0, 200_000)} [cut]` : text, isError: false };
}
