// Per-client credentials: the half that already lives at runtime.
//
// These are columns on the `tenants` row, read on every request, so a value
// saved here is live immediately with no deploy. That is why this half is
// separate from the agency secrets in Doppler: Doppler is one config per
// environment and has no way to model "client #5's token".
//
// Two kinds of field, treated differently on purpose:
//   secret  a credential. Never returned to the browser, only ever masked.
//   id      an account or property identifier. Not a secret, shown in full,
//           because hiding it would make it impossible to check against the
//           vendor's dashboard.
//
// Pure module: the endpoint and the page both import this, so the field list,
// the validation and the masking can never drift apart.

export type FieldKind = "secret" | "id";

export interface ClientSecretField {
  /** The tenants column. Also the key used in the PUT body. */
  column: string;
  label: string;
  kind: FieldKind;
  /** What it is and where to find it, so the form needs no external doc. */
  help: string;
  placeholder?: string;
}

export const CLIENT_SECRET_FIELDS: ClientSecretField[] = [
  {
    column: "ghl_location_id",
    label: "GoHighLevel location id",
    kind: "id",
    help: "The sub-account id. Find it in the GoHighLevel browser URL at /accounts, never by asking the client.",
    placeholder: "OznT3yyuwK3dqVXDsCaD",
  },
  {
    column: "ghl_token",
    label: "GoHighLevel private token",
    kind: "secret",
    help: "A Private Integration Token created inside that sub-account. Saving a new one takes effect on the next request.",
    placeholder: "pit-...",
  },
  {
    column: "meta_ad_account_id",
    label: "Meta ad account",
    kind: "id",
    help: "The client's ad account. Paste it with or without the act_ prefix, it gets normalised.",
    placeholder: "act_1234567890",
  },
  {
    column: "ga4_property_id",
    label: "GA4 property id",
    kind: "id",
    help: "Numeric property id. The agency service account must also be a Viewer on this property.",
    placeholder: "123456789",
  },
  {
    column: "google_place_id",
    label: "Google place id",
    kind: "id",
    help: "Identifies the business listing the review rating is pulled from.",
    placeholder: "ChIJ...",
  },
];

export const CLIENT_SECRET_COLUMNS = CLIENT_SECRET_FIELDS.map((f) => f.column);

export function fieldFor(column: string): ClientSecretField | undefined {
  return CLIENT_SECRET_FIELDS.find((f) => f.column === column);
}

// Values that mean "not configured" rather than a real credential. Mirrors
// isPlaceholder in functions/lib/tenantGhl.ts, which is what the read path uses.
const PLACEHOLDERS = new Set(["", "pending", "env"]);

export function isBlank(v: string | null | undefined): boolean {
  return v == null || PLACEHOLDERS.has(v.trim().toLowerCase());
}

/**
 * What the browser is allowed to see. A secret never leaves the server in full:
 * enough tail to confirm which token is loaded, never enough to use it.
 */
export function maskSecret(value: string | null | undefined): string | null {
  if (isBlank(value)) return null;
  const v = (value as string).trim();
  if (v.length <= 4) return "••••";
  return `••••${v.slice(-4)}`;
}

export interface NormalizeResult {
  ok: boolean;
  /** The value to store. Empty string means "clear this field". */
  value?: string;
  error?: string;
}

/**
 * Normalise and validate one pasted value. Normalising matters more than it
 * looks: an ad account pasted straight from Meta's UI arrives as bare digits,
 * and a GA4 property arrives as "properties/123". Both would silently return no
 * data if stored verbatim, which is the exact class of failure the control room
 * exists to surface.
 */
export function normalizeField(column: string, raw: string): NormalizeResult {
  const field = fieldFor(column);
  if (!field) return { ok: false, error: "Unknown field" };

  const v = raw.trim();
  // Explicit clear. Allowed for every field: disconnecting is a real action.
  if (v === "") return { ok: true, value: "" };

  switch (column) {
    case "meta_ad_account_id": {
      const digits = v.replace(/^act_/i, "");
      if (!/^\d+$/.test(digits)) {
        return { ok: false, error: "Ad account should be digits, with or without act_" };
      }
      return { ok: true, value: `act_${digits}` };
    }
    case "ga4_property_id": {
      const digits = v.replace(/^properties\//i, "");
      if (!/^\d+$/.test(digits)) {
        return { ok: false, error: "GA4 property id should be numeric" };
      }
      return { ok: true, value: digits };
    }
    case "ghl_location_id": {
      if (!/^[A-Za-z0-9]{15,30}$/.test(v)) {
        return { ok: false, error: "Location id should be 15 to 30 letters and digits" };
      }
      return { ok: true, value: v };
    }
    case "ghl_token": {
      if (/\s/.test(v)) return { ok: false, error: "Token should not contain spaces" };
      if (v.length < 20) return { ok: false, error: "That looks too short to be a token" };
      return { ok: true, value: v };
    }
    default:
      return { ok: true, value: v };
  }
}

export interface ValidatedPatch {
  ok: boolean;
  /** Column to value. Only fields the caller actually sent. */
  patch: Record<string, string>;
  /** Column to message, for fields that failed. */
  errors: Record<string, string>;
}

/**
 * Turn a PUT body into a safe column patch.
 *
 * Only keys present in the body are touched, so the form can send just what
 * changed and never has to round-trip a secret it was never given. Unknown keys
 * are dropped rather than errored, so a stale tab cannot write a column that is
 * not on the allow-list.
 */
export function validatePatch(body: unknown): ValidatedPatch {
  const out: ValidatedPatch = { ok: true, patch: {}, errors: {} };
  if (!body || typeof body !== "object") return { ok: false, patch: {}, errors: {} };

  for (const [key, raw] of Object.entries(body as Record<string, unknown>)) {
    if (!CLIENT_SECRET_COLUMNS.includes(key)) continue;
    if (typeof raw !== "string") {
      out.errors[key] = "Expected text";
      out.ok = false;
      continue;
    }
    const result = normalizeField(key, raw);
    if (!result.ok) {
      out.errors[key] = result.error ?? "Invalid";
      out.ok = false;
      continue;
    }
    out.patch[key] = result.value as string;
  }
  return out;
}

export interface ClientSecretView {
  column: string;
  /** Full value for ids, masked tail for secrets, null when not set. */
  display: string | null;
  configured: boolean;
}

/** Shape a tenants row for the browser: ids in full, secrets masked. */
export function viewRow(row: Record<string, unknown>): ClientSecretView[] {
  return CLIENT_SECRET_FIELDS.map((f) => {
    const raw = row[f.column];
    const value = typeof raw === "string" ? raw : null;
    const configured = !isBlank(value);
    return {
      column: f.column,
      display: f.kind === "secret" ? maskSecret(value) : configured ? (value as string).trim() : null,
      configured,
    };
  });
}
