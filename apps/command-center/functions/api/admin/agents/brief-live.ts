import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { isUuid } from "../../../lib/agentItems";
import { buildBriefLive } from "../../../lib/briefLive";
import { clientFolderFor, walkImages } from "../../../lib/clientDriveImages";
import { listChildrenOfMany, resolveDriveAccount } from "../../../lib/driveComposio";
import { getGhlContextForTenant } from "../../../lib/tenantGhl";
import { ghlJson } from "../../../lib/ghl";
import { listValues } from "../../../lib/customValuesMirror";
import { clientAnswerGroups } from "../../../../src/lib/briefClientSeed";

// GET /api/admin/agents/brief-live?tenant=<uuid> -> BriefLive
//
// The Mission Control's live parts: Client Information links, onboarding
// answers and Drive images, and the GHL page's custom values, pipelines,
// calendars and workflows (lib/briefLive.ts). Read only, owner only.

type Row = Record<string, unknown>;

const setting = (v: unknown) => (typeof v === "string" && v.trim() && v !== "pending" && v !== "env" ? v.trim() : null);

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const tenantId = new URL(ctx.request.url).searchParams.get("tenant");
  if (!isUuid(tenantId)) return Response.json({ error: "tenant required" }, { status: 400 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const live = await buildBriefLive({
    answers: async () => {
      const [{ data: row, error }, { data: sub }] = await Promise.all([
        client.from("onboarding").select("intake").eq("tenant_id", tenantId).maybeSingle(),
        client
          .from("intake_submissions")
          .select("password_plain")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (error) throw new Error(error.message);
      const intake = ((row as Row | null)?.intake ?? {}) as Row;
      const hasPassword = Boolean(((sub as Row | null)?.password_plain as string | null)?.trim());
      const site = typeof intake.websiteUrl === "string" ? intake.websiteUrl.trim() : "";
      return {
        groups: clientAnswerGroups(intake, { hasPassword }),
        website: site ? (/^https?:\/\//i.test(site) ? site : `https://${site}`) : null,
      };
    },
    tenant: async () => {
      const { data, error } = await client.from("tenants").select("meta_ad_account_id, ghl_location_id").eq("id", tenantId).maybeSingle();
      if (error) throw new Error(error.message);
      const r = (data ?? {}) as Row;
      return { metaAdAccountId: setting(r.meta_ad_account_id), ghlLocationId: setting(r.ghl_location_id) };
    },
    folder: () => clientFolderFor(client, tenantId),
    images: async (folderId) => {
      const account = await resolveDriveAccount(ctx.env);
      return walkImages(folderId, (ids) => listChildrenOfMany(ctx.env, account, ids));
    },
    ghl: async () => {
      const g = await getGhlContextForTenant(ctx.env, tenantId);
      const loc = encodeURIComponent(g.locationId);
      const [values, pipelines, calendars, workflows] = await Promise.all([
        listValues(g),
        ghlJson<unknown>(g, `/opportunities/pipelines?locationId=${loc}`),
        ghlJson<unknown>(g, `/calendars/?locationId=${loc}`),
        ghlJson<unknown>(g, `/workflows/?locationId=${loc}`),
      ]);
      return { values, pipelines, calendars, workflows };
    },
  });
  return Response.json(live, { headers: { "Cache-Control": "no-store" } });
};
