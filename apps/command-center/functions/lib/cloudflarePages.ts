// Writing the running deploy, from inside the running deploy.
//
// THE TRAP, and the reason this file is careful: Cloudflare's GET on a Pages
// project never returns secret VALUES. A read-modify-write therefore sends back
// every other secret as an empty string and blanks them. That is the recurring
// "login unavailable" outage, and scripts/cf-rebind.mjs exists because of it.
//
// The fix, copied from that script rather than reinvented: send every secret's
// REAL value, read from Doppler, in one PATCH. A secret Cloudflare holds that
// Doppler cannot supply is OMITTED from the payload entirely, never sent blank.
//
// Permission comes from CF_DEPLOY_TOKEN, which is scoped to Pages:Edit on this
// one project. The account-wide CLOUDFLARE_API_TOKEN is deliberately not used
// and is deliberately not bound to this app: an admin session that reached it
// could touch DNS and every other Worker on the account.

import type { Env } from "./env";
import type { DeploymentView } from "../../src/lib/secretsApi";

export type { DeploymentView };

const API = "https://api.cloudflare.com/client/v4";
const TIMEOUT_MS = 15000;
const DEFAULT_PROJECT = "hauck-command-center";

export class CloudflareError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function canDeploy(env: Env): boolean {
  return !!env.CF_DEPLOY_TOKEN && !!env.CLOUDFLARE_ACCOUNT_ID;
}

export function projectName(env: Env): string {
  return env.CF_PAGES_PROJECT || DEFAULT_PROJECT;
}

// --- The payload -------------------------------------------------------------

export interface CfEnvVar {
  type?: string;
  value?: string;
}

export interface EnvPayload {
  payload: Record<string, { type: string; value: string }>;
  /** Existing secrets rewritten with their Doppler value. */
  set: string[];
  /** Secrets Cloudflare has never seen, bound for the first time. */
  added: string[];
  /** Plain build vars carried through untouched. */
  preserved: string[];
  /** Cloudflare has these, Doppler cannot supply them. Left alone, never blanked. */
  skipped: string[];
  /** Asked for, but Doppler has no value. Reported rather than bound empty. */
  refused: string[];
}

/**
 * Build the single PATCH body.
 *
 * Pure, because every rule worth getting right here is a rule about what NOT to
 * include, and that is only testable in isolation.
 */
export function buildEnvPayload(
  current: Record<string, CfEnvVar>,
  doppler: Record<string, string>,
  addNames: string[],
): EnvPayload {
  const out: EnvPayload = {
    payload: {},
    set: [],
    added: [],
    preserved: [],
    skipped: [],
    refused: [],
  };

  for (const [key, cfg] of Object.entries(current)) {
    if (cfg?.type === "secret_text") {
      const value = doppler[key];
      if (value !== undefined && value !== "") {
        out.payload[key] = { type: "secret_text", value };
        out.set.push(key);
      } else {
        // No value to restore it with. Omitting it leaves Cloudflare's copy
        // exactly as it is; including it would overwrite a working secret with
        // an empty string, which is the outage this whole file guards against.
        out.skipped.push(key);
      }
    } else {
      // A plain build var (NODE_VERSION and friends). Cloudflare's own value is
      // authoritative: these are set in the dashboard and Doppler has no
      // opinion. Carried through so a full-map PATCH cannot drop them.
      out.payload[key] = { type: "plain_text", value: cfg?.value ?? doppler[key] ?? "" };
      out.preserved.push(key);
    }
  }

  for (const key of addNames) {
    if (key in current) continue; // already handled above
    const value = doppler[key];
    if (value === undefined || value === "") {
      // A blank secret reads as "configured" everywhere downstream and then
      // fails at the call site. Refuse it and say so.
      out.refused.push(key);
      continue;
    }
    out.payload[key] = { type: "secret_text", value };
    out.added.push(key);
  }

  return out;
}

// --- The API -----------------------------------------------------------------

interface CfResponse<T> {
  success?: boolean;
  result?: T;
  errors?: { message?: string }[];
}

async function cf<T>(env: Env, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.CF_DEPLOY_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => null)) as CfResponse<T> | null;
  if (!res.ok || !json?.success) {
    const message =
      json?.errors?.map((e) => e.message).filter(Boolean).join("; ") || `Cloudflare returned ${res.status}`;
    throw new CloudflareError(res.status, message);
  }
  return json.result as T;
}

function projectPath(env: Env): string {
  return `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/${projectName(env)}`;
}

interface ProjectResult {
  deployment_configs?: { production?: { env_vars?: Record<string, CfEnvVar> } };
}

/** The production env vars Cloudflare currently holds. Values of secrets are redacted by Cloudflare. */
export async function fetchEnvVars(env: Env): Promise<Record<string, CfEnvVar>> {
  const project = await cf<ProjectResult>(env, projectPath(env));
  return project?.deployment_configs?.production?.env_vars ?? {};
}

export async function patchEnvVars(
  env: Env,
  payload: Record<string, { type: string; value: string }>,
): Promise<void> {
  await cf(env, projectPath(env), {
    method: "PATCH",
    body: JSON.stringify({ deployment_configs: { production: { env_vars: payload } } }),
  });
}

interface DeploymentResult {
  id?: string;
  created_on?: string;
  latest_stage?: { name?: string; status?: string };
}

function viewDeployment(d: DeploymentResult): DeploymentView {
  const stage = d.latest_stage?.name ?? "queued";
  const status = d.latest_stage?.status ?? "active";

  let state: DeploymentView["state"] = "building";
  if (status === "failure" || status === "canceled") state = "failed";
  else if (stage === "deploy" && status === "success") state = "live";
  else if (stage === "queued" || stage === "initialize") state = "queued";

  return {
    id: d.id ?? "",
    state,
    stage,
    createdAt: d.created_on ?? null,
  };
}

/** Start one production deployment. */
export async function triggerDeploy(env: Env): Promise<DeploymentView> {
  const result = await cf<DeploymentResult>(env, `${projectPath(env)}/deployments`, {
    method: "POST",
  });
  return viewDeployment(result ?? {});
}

/** The most recent deployment, so the panel can poll until it lands. */
export async function latestDeployment(env: Env): Promise<DeploymentView | null> {
  const result = await cf<DeploymentResult[]>(env, `${projectPath(env)}/deployments?per_page=1`);
  const first = (result ?? [])[0];
  return first ? viewDeployment(first) : null;
}

export { viewDeployment as __viewDeployment };
