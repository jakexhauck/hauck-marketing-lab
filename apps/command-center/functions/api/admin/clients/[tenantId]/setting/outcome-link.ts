import type { Env, ApiData } from "../../../../../lib/env";
import { linkKey } from "../../../../../lib/callNow";
import { SETTER_OUTCOME_PURPOSE } from "../../../../../lib/outcome";
import { settingTenant } from "../../../../../lib/settingTenant";

// GET /api/admin/clients/:tenantId/setting/outcome-link?contactId=..
//   -> { url }  the outcome page for that lead (api/setter-outcome), to frame.

const ID = /^[A-Za-z0-9]{8,64}$/;

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const contactId = (new URL(ctx.request.url).searchParams.get("contactId") ?? "").trim();
  if (!ID.test(contactId)) return Response.json({ error: "bad contact" }, { status: 400 });
  const secret = (ctx.env.SESSION_SECRET ?? "").trim();
  if (!secret) return Response.json({ error: "not configured" }, { status: 503 });

  const t = await settingTenant(ctx.env, ctx.params.tenantId as string);
  if (t instanceof Response) return t;

  const key = await linkKey(secret, SETTER_OUTCOME_PURPOSE, t.locationId);
  const q = `l=${encodeURIComponent(t.locationId)}&c=${encodeURIComponent(contactId)}&k=${key}`;
  return Response.json({ url: `/api/setter-outcome?${q}` });
};
