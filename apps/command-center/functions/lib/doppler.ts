import type { Env } from "./env";

// Doppler is the source of truth for agency-wide secrets. This is the app's
// read (and optional write) path into it.
//
// Two separate tokens on purpose:
//   DOPPLER_TOKEN        read-only. Lets the control room show what Doppler
//                        holds and detect drift against the running app.
//   DOPPLER_WRITE_TOKEN  optional. Absent means in-app editing is simply off
//                        and the UI says so, rather than the app carrying write
//                        power it does not need. Write capability is opt-in.
//
// Values fetched here are compared and masked server-side. A raw agency secret
// is never returned to the browser.

const API = "https://api.doppler.com/v3";
const TIMEOUT_MS = 8000;

export const DEFAULT_PROJECT = "hauck-command-center";
export const DEFAULT_CONFIG = "prd";

export class DopplerError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function dopplerProject(env: Env): { project: string; config: string } {
  return {
    project: env.DOPPLER_PROJECT || DEFAULT_PROJECT,
    config: env.DOPPLER_CONFIG || DEFAULT_CONFIG,
  };
}

export function canReadDoppler(env: Env): boolean {
  return !!env.DOPPLER_TOKEN;
}

export function canWriteDoppler(env: Env): boolean {
  return !!env.DOPPLER_WRITE_TOKEN;
}

interface SecretsResponse {
  secrets?: Record<string, { raw?: string; computed?: string }>;
}

/**
 * Every secret Doppler holds for the project, as name to value.
 *
 * Uses `computed` in preference to `raw` so Doppler's own secret references
 * resolve the same way they would for any other consumer; falling back to raw
 * would make a referenced secret look different here than in production.
 */
export async function fetchDopplerSecrets(env: Env): Promise<Record<string, string>> {
  const token = env.DOPPLER_TOKEN;
  if (!token) throw new DopplerError(503, "No Doppler read token configured");
  const { project, config } = dopplerProject(env);

  const url = `${API}/configs/config/secrets?project=${encodeURIComponent(project)}&config=${encodeURIComponent(config)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new DopplerError(res.status, `Doppler returned ${res.status}`);
  }
  const data = (await res.json()) as SecretsResponse;
  const out: Record<string, string> = {};
  for (const [name, entry] of Object.entries(data.secrets ?? {})) {
    const value = entry.computed ?? entry.raw ?? "";
    out[name] = value;
  }
  return out;
}

/**
 * Write secrets back to Doppler. Only the named keys change; Doppler's own PATCH
 * semantics leave everything else untouched, which is what keeps this from
 * repeating the Cloudflare blanking outage.
 */
export async function writeDopplerSecrets(
  env: Env,
  secrets: Record<string, string>,
): Promise<void> {
  const token = env.DOPPLER_WRITE_TOKEN;
  if (!token) throw new DopplerError(403, "No Doppler write token configured");
  const { project, config } = dopplerProject(env);

  const res = await fetch(`${API}/configs/config/secrets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ project, config, secrets }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    throw new DopplerError(res.status, `Doppler rejected the write (${res.status}): ${body}`);
  }
}
