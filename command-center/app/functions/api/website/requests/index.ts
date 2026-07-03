import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient, resolveTenantId } from "../../../lib/supabase";

// Website > Request a Change. The client drops a pin on their live site and
// leaves a note; each note is a row here, scoped to the session's tenant (set in
// _middleware.ts). These rows are the shared source of truth the future admin
// mirror reads, so the client's request and Jake's admin view stay in sync.
//
// GET  /api/website/requests            -> { requests: WebsiteRequest[] }
// POST /api/website/requests  { page, device, xPct, yPct, note }
//                                       -> { request: WebsiteRequest }
//
// Supabase unconfigured or tenant unresolved => an empty, still-usable surface
// ({ requests: [], unavailable: true }) rather than an error, matching tour.ts.

interface RequestRow {
  id: string;
  page: string | null;
  device: string | null;
  x_pct: number;
  y_pct: number;
  note: string;
  status: string | null;
  created_at: string;
}

interface WebsiteRequest {
  id: string;
  page: string;
  device: "desktop" | "mobile";
  xPct: number;
  yPct: number;
  note: string;
  status: "open" | "in_progress" | "done";
  createdAt: string;
}

function shape(row: RequestRow): WebsiteRequest {
  const device = row.device === "mobile" ? "mobile" : "desktop";
  const status =
    row.status === "in_progress" || row.status === "done" ? row.status : "open";
  return {
    id: row.id,
    page: row.page ?? "home",
    device,
    xPct: row.x_pct,
    yPct: row.y_pct,
    note: row.note,
    status,
    createdAt: row.created_at,
  };
}

// Who filed it: a staff session is a real person (its id is authoritative); an
// owner (shared-password) session has no staff row. Best-effort label only, it
// never grants access (the middleware already authenticated the tenant).
function createdByFor(ctx: { data: ApiData }): string {
  const staffId = ctx.data.staff?.id;
  return staffId ? `staff:${staffId}` : "owner";
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ requests: [], unavailable: true });

  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ requests: [], unavailable: true });

  const { data, error } = await client
    .from("website_change_requests")
    .select("id, page, device, x_pct, y_pct, note, status, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return Response.json({ requests: [], unavailable: true });
  return Response.json({ requests: (data as RequestRow[]).map(shape) });
};

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "unavailable" }, { status: 503 });

  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "unavailable" }, { status: 503 });

  const body = (await ctx.request.json().catch(() => null)) as {
    page?: unknown;
    device?: unknown;
    xPct?: unknown;
    yPct?: unknown;
    note?: unknown;
  } | null;

  const note = typeof body?.note === "string" ? body.note.trim() : "";
  if (!note) return Response.json({ error: "note is required" }, { status: 400 });
  if (note.length > 2000) {
    return Response.json({ error: "note is too long" }, { status: 400 });
  }

  const xPct = Number(body?.xPct);
  const yPct = Number(body?.yPct);
  const inRange = (n: number) => Number.isFinite(n) && n >= 0 && n <= 100;
  if (!inRange(xPct) || !inRange(yPct)) {
    return Response.json({ error: "invalid pin position" }, { status: 400 });
  }

  const device = body?.device === "mobile" ? "mobile" : "desktop";
  const page =
    typeof body?.page === "string" && body.page.trim()
      ? body.page.trim().slice(0, 64)
      : "home";

  const { data, error } = await client
    .from("website_change_requests")
    .insert({
      tenant_id: tenantId,
      page,
      device,
      x_pct: xPct,
      y_pct: yPct,
      note,
      status: "open",
      created_by: createdByFor(ctx),
    })
    .select("id, page, device, x_pct, y_pct, note, status, created_at")
    .single();

  if (error || !data) {
    return Response.json({ error: "write failed" }, { status: 500 });
  }
  return Response.json({ request: shape(data as RequestRow) });
};
