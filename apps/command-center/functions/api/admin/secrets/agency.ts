import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import {
  fetchDopplerSecrets,
  writeDopplerSecrets,
  canReadDoppler,
  canWriteDoppler,
  dopplerProject,
  DopplerError,
} from "../../../lib/doppler";
import { CONNECTIONS } from "../../../../src/lib/connectionRegistry";
import { isLocked, LOCK_REASON } from "../../../../src/lib/agencyKeys";
import { maskSecret } from "../../../../src/lib/clientSecrets";
import type { AgencySecretRow } from "../../../../src/lib/secretsApi";

// /api/admin/secrets/agency  (admin-only, gated in _middleware.ts)
//
// Agency-wide secrets, with Doppler as the source of truth.
//
// The part worth having is DRIFT. Cloudflare env vars only change on a deploy,
// so Doppler and the running app can silently disagree for weeks. This endpoint
// compares the two, server-side, and reports a boolean. It never returns either
// raw value: comparison happens here, only a mask crosses the wire.
//
// Drift is the answer to "make sure they stay in here". Without it, the app can
// show a value that looks right while the deploy is running something else,
// which is worse than showing nothing.

/** Cloudflare-homed credentials the registry knows about, deduplicated. */
function knownCredentialNames(): string[] {
  const names = new Set<string>();
  for (const def of CONNECTIONS) {
    for (const c of def.credentials) {
      if (c.home === "cloudflare") names.add(c.name);
    }
  }
  return [...names];
}

function runtimeValue(env: Env, name: string): string | null {
  const raw = (env as unknown as Record<string, unknown>)[name];
  return typeof raw === "string" && raw.trim() !== "" ? raw : null;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const { project, config } = dopplerProject(ctx.env);
  const base = {
    project,
    config,
    canRead: canReadDoppler(ctx.env),
    canEdit: canWriteDoppler(ctx.env),
  };

  let doppler: Record<string, string> | null = null;
  let readError: string | null = null;
  if (base.canRead) {
    try {
      doppler = await fetchDopplerSecrets(ctx.env);
    } catch (e) {
      readError = e instanceof Error ? e.message : String(e);
    }
  }

  // Which integration uses each key, so the table explains itself.
  const usedBy = new Map<string, string[]>();
  const optional = new Map<string, boolean>();
  for (const def of CONNECTIONS) {
    for (const c of def.credentials) {
      if (c.home !== "cloudflare") continue;
      usedBy.set(c.name, [...(usedBy.get(c.name) ?? []), def.label]);
      // Optional only if every integration that uses it treats it as optional.
      optional.set(c.name, (optional.get(c.name) ?? true) && !!c.optional);
    }
  }

  const rows: AgencySecretRow[] = knownCredentialNames()
    .sort()
    .map((name) => {
      const dopplerValue = doppler?.[name] ?? null;
      const runtime = runtimeValue(ctx.env, name);
      const inDoppler = !!dopplerValue && dopplerValue.trim() !== "";
      const inRuntime = runtime !== null;
      return {
        name,
        usedBy: usedBy.get(name) ?? [],
        optional: optional.get(name) ?? false,
        inDoppler,
        inRuntime,
        masked: maskSecret(dopplerValue ?? runtime),
        drift: inDoppler && inRuntime ? dopplerValue !== runtime : null,
      };
    });

  // Keys Doppler holds that no integration claims. Usually dead weight from a
  // retired feature, occasionally a key the code forgot to read.
  const unclaimed = doppler
    ? Object.keys(doppler)
        .filter((k) => !usedBy.has(k))
        .sort()
    : [];

  return Response.json(
    { ...base, readError, rows, unclaimed },
    { headers: { "Cache-Control": "no-store" } },
  );
};

export const onRequestPut: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (!canWriteDoppler(ctx.env)) {
    return Response.json(
      { error: "Editing is off. Add DOPPLER_WRITE_TOKEN to turn it on." },
      { status: 403 },
    );
  }

  let body: { name?: unknown; value?: unknown };
  try {
    body = (await ctx.request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const value = typeof body.value === "string" ? body.value : null;
  if (!name || value === null) {
    return Response.json({ error: "Send a name and a value." }, { status: 400 });
  }

  // Allow-list. Without this the endpoint would be a general-purpose write into
  // the agency's whole secret store, reachable from any admin session.
  if (!knownCredentialNames().includes(name)) {
    return Response.json(
      { error: "That key is not one this app declares. Add it to the registry first." },
      { status: 400 },
    );
  }

  // Enforced HERE, not only in the UI. Three of these keys are what grant this
  // endpoint its own power (the Cloudflare deploy token and both Doppler
  // tokens), so a write path that trusted a hidden button could be used to
  // revoke its own access or quietly widen it. The Supabase three are refused
  // for a duller reason: nothing about a new client needs them changed.
  if (isLocked(name)) {
    return Response.json(
      { error: `${name} cannot be changed here. ${LOCK_REASON[name] ?? ""}`.trim() },
      { status: 403 },
    );
  }

  try {
    await writeDopplerSecrets(ctx.env, { [name]: value });
  } catch (e) {
    const status = e instanceof DopplerError ? e.status : 502;
    return Response.json(
      { error: e instanceof Error ? e.message : "Doppler write failed." },
      { status },
    );
  }

  const client = getServiceClient(ctx.env);
  const adminId = ctx.data.admin?.id;
  if (client && adminId) {
    // Name only, never the value: this log is readable inside the app.
    await logAdminAction(client, adminId, "secrets.agency.update", null, {
      name,
      cleared: value === "",
    });
  }

  return Response.json({
    name,
    masked: maskSecret(value),
    // Saying this plainly is the point: Doppler now holds the new value but the
    // running deploy still has the old one until it is rebound and redeployed.
    note: "Saved to Doppler. The running app keeps the old value until you rebind and redeploy.",
  });
};
