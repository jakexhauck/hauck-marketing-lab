import type { Env, ApiData } from "../../../../../lib/env";
import { tenantTimezone } from "../../../../../lib/env";
import { readBoard } from "../../../../../lib/boardRead";
import { settingTenant } from "../../../../../lib/settingTenant";

// GET /api/admin/clients/:tenantId/setting/board -> the client's Sales Pipeline,
// the same read as their own Leads board (lib/boardRead.ts). Admin only, upstream.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = await settingTenant(ctx.env, ctx.params.tenantId as string);
  if (t instanceof Response) return t;
  const read = await readBoard(t.client, t.gctx, t.slug, tenantTimezone(ctx.env));
  return Response.json(read.body, read.ok ? undefined : { status: read.status });
};
