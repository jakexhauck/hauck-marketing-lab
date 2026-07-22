import type { Env, ApiData } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";

// GET /api/admin/audit  (admin-only, gated in _middleware.ts)
//
// The reader for public.admin_audit_log (migration 0008), written by
// logAdminAction in functions/lib/adminAuth.ts. The table has been collecting
// rows since 0008 and has never had a reader, which matters now that the
// Setter Suite can message a client's entire customer base with no approval
// step: with no per-setter accounts, this log is the whole accountability
// story. Filterable by tenant and by action so `setter.send` can be isolated.
//
// Paged deliberately: the log only grows, so an unbounded select would get
// slower forever and eventually time out on the surface meant to prove
// accountability.

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

export interface AuditQuery {
  limit: number;
  offset: number;
  tenantId: string | null;
  action: string | null;
}

function positiveInt(raw: string | null, fallback: number): number {
  const n = Number(raw);
  if (!raw || !Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function trimmedOrNull(raw: string | null): string | null {
  const v = (raw ?? "").trim();
  return v ? v : null;
}

export function parseAuditQuery(url: URL): AuditQuery {
  const p = url.searchParams;
  const limit = Math.min(positiveInt(p.get("limit"), DEFAULT_LIMIT), MAX_LIMIT);
  const rawOffset = Number(p.get("offset"));
  const offset =
    Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
  return {
    limit,
    offset,
    tenantId: trimmedOrNull(p.get("tenantId")),
    action: trimmedOrNull(p.get("action")),
  };
}

// The raw row as Supabase returns it, with the two joins embedded. Both joins
// are `on delete set null` / `on delete cascade` relationships, so either can
// come back null and the shaper must not assume otherwise.
export interface RawAuditRow {
  id: number | string;
  admin_id: string;
  action: string;
  target_tenant_id: string | null;
  payload: unknown;
  created_at: string;
  admin_accounts: { name: string | null; email: string | null } | null;
  tenants: { name: string | null } | null;
}

export interface AuditEntry {
  id: string;
  createdAt: string;
  adminId: string;
  adminName: string | null;
  adminEmail: string | null;
  action: string;
  tenantId: string | null;
  tenantName: string | null;
  payload: unknown;
}

export function shapeAuditRow(row: RawAuditRow): AuditEntry {
  return {
    // bigserial: stringified so a large id never loses precision in JSON.
    id: String(row.id),
    createdAt: row.created_at,
    adminId: row.admin_id,
    adminName: row.admin_accounts?.name ?? null,
    adminEmail: row.admin_accounts?.email ?? null,
    action: row.action,
    tenantId: row.target_tenant_id,
    tenantName: row.tenants?.name ?? null,
    payload: row.payload ?? null,
  };
}

// admin_audit_log has exactly one FK to each of admin_accounts and tenants, so
// the embeds resolve without a disambiguating hint.
const SELECT =
  "id, admin_id, action, target_tenant_id, payload, created_at, admin_accounts(name, email), tenants(name)";

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  // Defence in depth. _middleware.ts is the real gate for /api/admin/*, but
  // this route returns every cross-tenant action ever taken, so it refuses to
  // answer without a resolved admin rather than trusting the gate upstream.
  const admin = ctx.data?.admin;
  if (!admin) return Response.json({ error: "unauthorized" }, { status: 401 });

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const q = parseAuditQuery(new URL(ctx.request.url));

  // `id` is the tiebreaker, and it is not decoration. created_at alone leaves
  // rows that share a timestamp in an undefined order, so the same row can sit
  // on either side of a page boundary between two requests and be skipped
  // entirely. On the surface whose whole purpose is proving a customer was
  // messaged, a silently dropped row is the one failure that matters.
  let query = client
    .from("admin_audit_log")
    .select(SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (q.tenantId) query = query.eq("target_tenant_id", q.tenantId);
  if (q.action) query = query.eq("action", q.action);

  const { data, count, error } = await query.range(q.offset, q.offset + q.limit - 1);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const entries = ((data ?? []) as unknown as RawAuditRow[]).map(shapeAuditRow);
  const total = count ?? entries.length;

  return Response.json({
    entries,
    total,
    limit: q.limit,
    offset: q.offset,
    hasMore: q.offset + entries.length < total,
  });
};
