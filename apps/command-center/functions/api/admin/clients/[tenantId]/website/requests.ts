import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { loadTenantById } from "../../../../../lib/tenantResolve";

// Admin-tenant read of a client's website change requests for the Fulfillment
// cockpit (Web Design > Change Requests). The client path resolves the tenant by
// slug and can POST new pins; the admin path has the tenant UUID in the URL and
// is READ-ONLY: Jake makes the edit himself in GHL, so there is deliberately no
// POST here. Same row -> wire shape as the client endpoint, so the cockpit reads
// exactly what the client filed. Auth is enforced upstream (admin session only).
//
// GET /api/admin/clients/:tenantId/website/requests -> { requests: [...] }

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

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ requests: [], unavailable: true });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await loadTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  const { data, error } = await client
    .from("website_change_requests")
    .select("id, page, device, x_pct, y_pct, note, status, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return Response.json({ requests: [], unavailable: true });
  return Response.json({ requests: (data as RequestRow[]).map(shape) });
};
