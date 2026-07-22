import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";

// GET /api/admin/setter/callbacks?tenantId= (admin-only, gated in
// _middleware.ts). Pending scheduled callbacks for one client, soonest due
// first: the board rail's data. Rows are written by task.ts (the mirror
// insert) and completed by ./complete.ts.

export interface ApiSetterCallback {
  id: string;
  contactId: string;
  contactName: string;
  title: string;
  dueAt: string;
  ghlTaskId: string | null;
}

interface RawCallbackRow {
  id: string;
  contact_id: string;
  contact_name: string;
  title: string;
  due_at: string;
  ghl_task_id: string | null;
}

// The rail shows overdue plus what is coming; a hard cap keeps a neglected
// backlog from turning the response into the whole table.
const LIMIT = 100;

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const tenantId = url.searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "missing_tenant_id" }, { status: 400 });

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data, error } = await client
    .from("setter_callbacks")
    .select("id, contact_id, contact_name, title, due_at, ghl_task_id")
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    .order("due_at", { ascending: true })
    .limit(LIMIT);
  if (error) return Response.json({ error: "callbacks_lookup_failed" }, { status: 500 });

  const callbacks = ((data ?? []) as RawCallbackRow[]).map((r) => ({
    id: r.id,
    contactId: r.contact_id,
    contactName: r.contact_name,
    title: r.title,
    dueAt: r.due_at,
    ghlTaskId: r.ghl_task_id,
  }));
  return Response.json({ callbacks });
};
