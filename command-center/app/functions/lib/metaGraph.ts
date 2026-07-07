// Shared Meta Graph API v21.0 helpers for the Paid Ads endpoints
// (functions/api/ads/insights.ts, functions/api/ads/media.ts). One agency
// System-User token spans every client's ad account; the account itself is
// resolved per tenant (see resolveAdAccount). Extracted so both endpoints
// call one implementation instead of two drifting copies.

export const GRAPH = "https://graph.facebook.com/v21.0";

export async function graphGet(
  token: string,
  path: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const url = new URL(GRAPH + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

// Follow Meta's cursor paging so an account with more than one page of results
// (e.g. the media library at limit 200) returns its WHOLE set, not just the
// first page. Capped at maxPages so a runaway account can't hang the request.
const MAX_PAGES = 10;

export async function graphGetAll(
  token: string,
  path: string,
  params: Record<string, string>,
  maxPages: number = MAX_PAGES,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let next: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    let resp: Record<string, unknown>;
    if (next) {
      const res = await fetch(next);
      if (!res.ok) break;
      resp = (await res.json()) as Record<string, unknown>;
    } else {
      resp = await graphGet(token, path, params);
    }
    const data = (resp.data as Record<string, unknown>[]) ?? [];
    rows.push(...data);
    const paging = (resp.paging ?? {}) as { next?: string };
    if (!paging.next) break;
    next = paging.next;
  }
  return rows;
}

// The ad account for this request: the client's own (from their tenant row)
// wins; the global env var is only the single-tenant fallback. Exported for
// the precedence test, which is the whole point of scoping ads per client.
export function resolveAdAccount(
  tenantAccount: string | undefined,
  envAccount: string | undefined,
): string | undefined {
  const t = tenantAccount?.trim();
  if (t) return t;
  const e = envAccount?.trim();
  return e || undefined;
}
