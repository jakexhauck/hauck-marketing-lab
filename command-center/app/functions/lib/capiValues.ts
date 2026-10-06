// Client > GHL > CAPI: cleaning and masking for the two stored values.
// Pure; the endpoint is functions/api/admin/clients/[tenantId]/capi.

/** The two GHL custom values these land in (both exist in the client snapshot). */
export const CAPI_CUSTOM_VALUES = {
  datasetId: "Facebook Dataset ID",
  accessToken: "Facebook Access Token",
} as const;

/** A dataset (pixel) id is digits only. Returns null when it is not one. */
export function cleanDatasetId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (v === "") return "";
  return /^\d{6,25}$/.test(v) ? v : null;
}

/** A token is one line of printable characters, no spaces. Null when it is not one. */
export function cleanToken(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (v === "") return "";
  return /^[\x21-\x7e]{20,1000}$/.test(v) ? v : null;
}

/** "EAAGabc...wxyz": enough to recognise, not enough to use. */
export function maskToken(token: string): string {
  if (!token) return "";
  if (token.length <= 12) return "••••";
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}
