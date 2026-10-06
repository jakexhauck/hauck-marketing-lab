import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { cleanText, readCopy, saveCopy } from "../../../../../lib/clientCopyStore";
import { isCopyKind, type CopySettings } from "../../../../../../src/lib/followUpCopy";

// GET /api/admin/clients/:tenantId/copy/:kind   the saved texts (ltn | lead_fu)
// PUT /api/admin/clients/:tenantId/copy/:kind   body { items?, settings? }: Jake's edits
//
// Writing them with Claude is ./[kind]/write.ts. Owner only.

type Params = "tenantId" | "kind";

async function businessName(client: NonNullable<ReturnType<typeof getServiceClient>>, tenantId: string) {
  const { data } = await client.from("tenants").select("name").eq("id", tenantId).maybeSingle();
  return ((data as { name?: string } | null)?.name ?? "").trim();
}

export const onRequestGet: PagesFunction<Env, Params, ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const kind = ctx.params.kind as string;
  if (!isCopyKind(kind)) return Response.json({ error: "Unknown kind" }, { status: 404 });
  const tenantId = ctx.params.tenantId as string;
  try {
    return Response.json(await readCopy(client, tenantId, kind, await businessName(client, tenantId)));
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
};

export const onRequestPut: PagesFunction<Env, Params, ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const kind = ctx.params.kind as string;
  if (!isCopyKind(kind)) return Response.json({ error: "Unknown kind" }, { status: 404 });
  const tenantId = ctx.params.tenantId as string;

  let body: { items?: unknown; settings?: unknown };
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  try {
    const name = await businessName(client, tenantId);
    const current = await readCopy(client, tenantId, kind, name);
    const incoming = new Map<string, string>();
    if (Array.isArray(body.items)) {
      for (const it of body.items as { key?: unknown; text?: unknown }[]) {
        if (typeof it?.key === "string") incoming.set(it.key, cleanText(it.text));
      }
    }
    const items = current.items.map((i) => (incoming.has(i.key) ? { key: i.key, text: incoming.get(i.key)! } : i));
    const s = (body.settings ?? {}) as { photo?: unknown };
    const settings: CopySettings = { ...current.settings };
    if (s.photo === "owner" || s.photo === "crew") settings.photo = s.photo;

    await saveCopy(client, tenantId, kind, { items, settings });
    return Response.json(await readCopy(client, tenantId, kind, name));
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
};
