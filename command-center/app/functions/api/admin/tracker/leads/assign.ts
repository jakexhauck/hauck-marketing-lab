import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { logAdminAction } from "../../../../lib/adminAuth";

// PATCH /api/admin/tracker/leads/assign  (owner-only)
//
// Hand a batch of prospects to somebody, or take them back. This is the whole
// point of selecting rows in the book: "these two hundred are yours, start at
// the top".
//
// assignedTo null returns the rows to the pool. The target must be an ACTIVE
// admin account, checked here rather than trusted from the browser, so work
// cannot be parked on a disabled login where it would sit on nobody's queue
// while looking assigned.

const MAX_IDS = 5000;

interface Body {
  ids?: unknown;
  assignedTo?: unknown;
}

export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const admin = ctx.data.admin!;
  if (admin.role !== "owner") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let body: Body;
  try {
    body = (await ctx.request.json()) as Body;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.filter((v): v is string => typeof v === "string" && v.trim() !== ""))]
    : [];
  if (ids.length === 0) {
    return Response.json({ error: "Select at least one lead." }, { status: 400 });
  }
  if (ids.length > MAX_IDS) {
    return Response.json({ error: "Too many leads at once." }, { status: 400 });
  }

  const raw = body.assignedTo;
  if (raw !== null && raw !== undefined && typeof raw !== "string") {
    return Response.json({ error: "invalid assignee" }, { status: 400 });
  }
  const assignedTo = typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;

  if (assignedTo) {
    const { data: target } = await client
      .from("admin_accounts")
      .select("id, status")
      .eq("id", assignedTo)
      .maybeSingle();
    const row = target as { id: string; status: string } | null;
    if (!row) return Response.json({ error: "That person has no login." }, { status: 404 });
    if (row.status !== "active") {
      return Response.json(
        { error: "That login is disabled. Restore it before assigning work." },
        { status: 409 },
      );
    }
  }

  const { data, error } = await client
    .from("leads")
    .update({ assigned_to: assignedTo, updated_at: new Date().toISOString() })
    .in("id", ids)
    .is("deleted_at", null)
    .select("id");
  if (error) {
    console.error("[leads/assign] update failed", error.message);
    return Response.json({ error: "Could not assign those leads." }, { status: 500 });
  }

  const updated = (data ?? []).length;
  await logAdminAction(client, admin.id, "leads.assign", null, {
    count: updated,
    assignedTo,
  });

  return Response.json({ updated });
};
