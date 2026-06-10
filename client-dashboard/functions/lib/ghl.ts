const BASE = "https://services.leadconnectorhq.com";
const VERSION = "2021-07-28";

export interface GhlContext {
  token: string;
  locationId: string;
}

export async function ghlFetch(
  ctx: GhlContext,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = path.startsWith("http") ? path : BASE + path;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${ctx.token}`);
  headers.set("Version", VERSION);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  // Only idempotent reads are retried. Retrying a POST on a 5xx/429 risks
  // duplicate side effects (double SMS, double note); those surface the error
  // to the caller immediately instead.
  const method = (init.method ?? "GET").toUpperCase();
  const retryable = method === "GET" || method === "HEAD";

  let res = await fetch(url, { ...init, headers });
  if (!retryable) return res;

  if (res.status >= 500) {
    await new Promise((r) => setTimeout(r, 1000));
    res = await fetch(url, { ...init, headers });
  } else if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Math.min(
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000,
      2000,
    );
    await new Promise((r) => setTimeout(r, waitMs));
    res = await fetch(url, { ...init, headers });
  }
  return res;
}

export async function ghlJson<T>(
  ctx: GhlContext,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await ghlFetch(ctx, path, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `GHL ${init.method ?? "GET"} ${path} returned ${res.status}: ${body.slice(0, 500)}`,
    );
  }
  return (await res.json()) as T;
}

// GHL's billing APIs (invoices, payments) do not accept locationId like the
// rest of the app. They take altId={locationId}&altType=location. Encode it once
// so no route hand-builds it.
export function altQuery(locationId: string): string {
  return `altId=${encodeURIComponent(locationId)}&altType=location`;
}

export interface GhlOpportunity {
  id: string;
  name?: string;
  monetaryValue?: number;
  status?: string;
  pipelineId?: string;
  pipelineStageId?: string;
  createdAt?: string;
  updatedAt?: string;
  lastStatusChangeAt?: string;
  contactId?: string;
  contact?: {
    id?: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  };
  source?: string;
  // GHL user id this opportunity is assigned to (drives rep-only filtering).
  assignedTo?: string;
}

export interface ApiLead {
  id: string;
  name: string;
  phone: string;
  email: string;
  contactId: string;
  pipelineId: string;
  pipelineStageId: string;
  status: string;
  value: number | null;
  createdAt: string;
  lastActivityAt: string;
  // GHL user id the opportunity is assigned to, or null if unassigned.
  assignedUserId: string | null;
}

export function shapeOpportunity(o: GhlOpportunity): ApiLead {
  const fullName =
    o.contact?.name ||
    [o.contact?.firstName, o.contact?.lastName].filter(Boolean).join(" ").trim();
  return {
    id: o.id,
    name: o.name || fullName || "Unknown",
    phone: o.contact?.phone ?? "",
    email: o.contact?.email ?? "",
    contactId: o.contact?.id ?? o.contactId ?? "",
    pipelineId: o.pipelineId ?? "",
    pipelineStageId: o.pipelineStageId ?? "",
    status: o.status ?? "open",
    value: typeof o.monetaryValue === "number" ? o.monetaryValue : null,
    createdAt: o.createdAt ?? new Date().toISOString(),
    lastActivityAt:
      o.lastStatusChangeAt ?? o.updatedAt ?? o.createdAt ?? new Date().toISOString(),
    assignedUserId: o.assignedTo ?? null,
  };
}
