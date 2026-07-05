// Google Analytics 4 Data API access from the Workers runtime. A single agency
// service-account key (GA4_SA_JSON) reads every client's GA4 property; the
// property id is per-tenant (tenants.ga4_property_id), which is what keeps one
// client from ever seeing another's numbers. Same auth shape suits any future
// Google Data API: sign a JWT with the SA key, exchange it for an
// analytics.readonly access token, then call the Data API with fetch. No
// googleapis SDK (it does not run on Workers).

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const DATA_API = "https://analyticsdata.googleapis.com/v1beta";

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

// GA4 runReport request shape (only the fields we use). The Data API accepts far
// more; keep this to what the analytics endpoint sends.
export interface ReportRequest {
  dateRanges?: { startDate: string; endDate: string }[];
  dimensions?: { name: string }[];
  metrics?: { name: string }[];
  orderBys?: { metric: { metricName: string }; desc?: boolean }[];
  limit?: number;
  keepEmptyRows?: boolean;
}

export interface ReportRow {
  dimensionValues?: { value?: string }[];
  metricValues?: { value?: string }[];
}
export interface ReportResponse {
  rows?: ReportRow[];
}

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// PEM (PKCS#8) private key -> ArrayBuffer of the DER body.
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// Access tokens last ~1h; cache per service-account email in the warm isolate so
// most requests skip the token round-trip. Refresh a minute early.
interface CachedToken {
  token: string;
  expiresAt: number;
}
const tokenCache = new Map<string, CachedToken>();

async function mintToken(sa: ServiceAccount): Promise<string> {
  const cached = tokenCache.get(sa.client_email);
  const now = Date.now();
  if (cached && cached.expiresAt > now + 60_000) return cached.token;

  const iat = Math.floor(now / 1000);
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claim = base64url(
    new TextEncoder().encode(
      JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }),
    ),
  );
  const signingInput = `${header}.${claim}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${base64url(sig)}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`GA4 token exchange failed (${res.status})`);
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("GA4 token exchange returned no access_token");

  tokenCache.set(sa.client_email, {
    token: json.access_token,
    expiresAt: now + (json.expires_in ?? 3600) * 1000,
  });
  return json.access_token;
}

// Parse the GA4_SA_JSON env string into a service account, or null if unset /
// malformed. The endpoint treats null as not-connected (honest empty state).
export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as Partial<ServiceAccount>;
    if (!j.client_email || !j.private_key) return null;
    return { client_email: j.client_email, private_key: j.private_key };
  } catch {
    return null;
  }
}

// Run several GA4 reports in one HTTP call (batchRunReports, up to 5). Returns
// the reports in request order.
export async function batchRunReports(
  sa: ServiceAccount,
  propertyId: string,
  requests: ReportRequest[],
): Promise<ReportResponse[]> {
  const token = await mintToken(sa);
  const res = await fetch(`${DATA_API}/properties/${propertyId}:batchRunReports`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GA4 batchRunReports failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { reports?: ReportResponse[] };
  return json.reports ?? [];
}
