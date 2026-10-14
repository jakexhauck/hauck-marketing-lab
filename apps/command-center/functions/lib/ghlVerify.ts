import { ghlFetch, type GhlContext } from "./ghl";

// Proving a client's GoHighLevel credentials before they are stored.
//
// A token and a location id are two strings until something answers with them,
// and a saved-but-wrong pair is worse than none: every surface that reads the
// sub-account (leads, conversations, calendars, revenue) reports an empty
// account rather than a broken connection, and the operator is told the client
// is connected. So the pair is used before it is trusted, exactly as the Meta
// token is.
//
// The probe is a ladder because a Private Integration token carries only the
// scopes it was ticked for. /locations/:id is the best answer (it comes back
// with the sub-account's own name, which is what an operator recognises), but a
// token without locations.readonly is not a broken token, so a rejection there
// falls through to two reads every working integration can do.

export type GhlVerifyResult =
  | { ok: true; locationName: string | null }
  | { ok: false; error: string };

interface Probe {
  path: (locationId: string) => string;
  /** Whether a success carries the sub-account's name. */
  named?: boolean;
}

const PROBES: Probe[] = [
  { path: (id) => `/locations/${encodeURIComponent(id)}`, named: true },
  { path: (id) => `/opportunities/pipelines?locationId=${encodeURIComponent(id)}` },
  { path: (id) => `/contacts/?locationId=${encodeURIComponent(id)}&limit=1` },
];

// GHL's own sentence when it has one, rather than the JSON envelope around it.
//
// "Forbidden resource" is not a sentence anybody can act on: it is what GHL
// says both for a location id belonging to somebody else and for an integration
// missing a scope. A bare word like that is replaced by the two things worth
// checking; anything GHL says that is actually specific is kept as it is.
const USELESS = /^(forbidden|unauthorized|not found|bad request|forbidden resource)\.?$/i;

function reason(status: number, body: string): string {
  const match = body.match(/"message"\s*:\s*"([^"]+)"/);
  const raw = match?.[1]?.trim() ?? "";
  const said = USELESS.test(raw) ? "" : raw;
  if (status === 401) {
    return said || "GoHighLevel did not accept that token.";
  }
  if (status === 403) {
    return (
      said ||
      "That token cannot read that location. Check the location id, and that the integration was ticked for these scopes."
    );
  }
  if (status === 404) {
    return said || "GoHighLevel has no location with that id.";
  }
  return said || `GoHighLevel returned ${status}.`;
}

/**
 * Ask GoHighLevel whether this token can read this sub-account.
 *
 * Returns the location's name when the token was allowed to say it, which is
 * the one thing that lets an operator catch a right-looking id belonging to the
 * wrong client.
 */
export async function verifyGhlCreds(
  token: string,
  locationId: string,
): Promise<GhlVerifyResult> {
  const ctx: GhlContext = { token: token.trim(), locationId: locationId.trim() };
  if (!ctx.token) return { ok: false, error: "Paste the token first." };
  if (!ctx.locationId) return { ok: false, error: "Paste the location id first." };

  // The first refusal is the one worth reporting: later probes fail for
  // whatever the earlier one failed for, and the last in the ladder has the
  // vaguest error of the three.
  let firstError: string | null = null;

  for (const probe of PROBES) {
    let res: Response;
    try {
      res = await ghlFetch(ctx, probe.path(ctx.locationId));
    } catch (err) {
      // A network failure is not a verdict on the credentials, so it stops the
      // ladder rather than reading as a rejection of the next probe too.
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Could not reach GoHighLevel.",
      };
    }

    if (res.ok) {
      if (!probe.named) return { ok: true, locationName: null };
      const body = (await res.json().catch(() => null)) as
        | { location?: { name?: string }; name?: string }
        | null;
      const name = (body?.location?.name ?? body?.name ?? "").trim();
      return { ok: true, locationName: name || null };
    }

    const body = await res.text().catch(() => "");
    if (firstError === null) firstError = reason(res.status, body);
    // A token GHL will not authenticate at all cannot be fixed by asking it
    // something easier.
    if (res.status === 401) break;
  }

  return { ok: false, error: firstError ?? "GoHighLevel refused that pair." };
}

/**
 * The shape checks worth doing before a request is made. Pasting from GHL's own
 * UI brings labels and line breaks along, and a value with a space in it fails
 * on every call afterwards rather than at the box that accepted it.
 */
export function credsShapeError(token: string, locationId: string): string | null {
  if (/\s/.test(token.trim())) return "That token has spaces in it. Copy just the token.";
  if (/\s/.test(locationId.trim())) {
    return "That location id has spaces in it. Copy just the id.";
  }
  return null;
}
