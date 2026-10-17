import type { Env, ApiData } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import { graphGetAll } from "../../lib/metaGraph";
import { resolveMetaToken } from "../../lib/metaToken";
import { isUuid } from "../../lib/agentItems";

// GET /api/agent-runner/meta?tenant=<uuid>&level=account|campaign|ad&days=7
//   -> { account, level, preset, rows }
//
// Meta insights for the Ads, Reporting and Manager agents (the runner's
// bin/meta.mjs calls this). READ-ONLY, and enforced here rather than in the
// agents' instructions: this file reaches Meta only through the Graph GET
// helpers, and it must never import a module that can create, change or
// upload anything at Meta. agentRunner.test.ts scans this file's source to
// keep it so. The token never leaves Cloudflare; the PC only sees the rows.
//
// Rows are Meta's own fields, untouched, `actions` included. Counting leads
// from `actions` is the agent's job: take Meta's `lead` roll-up, never the sum
// of every lead-ish action type (that double counts).

type Level = "account" | "campaign" | "ad";

const FIELDS: Record<Level, string> = {
  account: "spend,impressions,reach,frequency,clicks,ctr,cpc,cpm,actions,cost_per_action_type",
  campaign:
    "campaign_id,campaign_name,spend,impressions,reach,frequency,clicks,ctr,cpc,cpm,actions,cost_per_action_type",
  ad: "ad_id,ad_name,adset_name,campaign_name,spend,impressions,reach,frequency,clicks,ctr,cpc,cpm,actions,cost_per_action_type",
};

// Meta's named windows, cut in the ad account's own timezone. A window by
// preset rather than computed dates, so a day here is the same day Ads
// Manager shows. The smallest preset that covers the days asked for.
const PRESETS: [number, string][] = [
  [1, "yesterday"],
  [3, "last_3d"],
  [7, "last_7d"],
  [14, "last_14d"],
  [28, "last_28d"],
  [30, "last_30d"],
  [90, "last_90d"],
];

export function metaQuery(level: string | null, days: string | null): { level: Level; preset: string } | null {
  const l = (level ?? "account") as Level;
  if (!(l in FIELDS)) return null;
  const n = Number(days ?? "7");
  if (!Number.isFinite(n) || n < 1 || n > 90) return null;
  const preset = PRESETS.find(([d]) => d >= n)![1];
  return { level: l, preset };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const tenantId = url.searchParams.get("tenant");
  if (!isUuid(tenantId)) return Response.json({ error: "tenant required" }, { status: 400 });
  const q = metaQuery(url.searchParams.get("level"), url.searchParams.get("days"));
  if (!q) return Response.json({ error: "level is account, campaign or ad; days 1 to 90" }, { status: 400 });

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const { data: t } = await client.from("tenants").select("meta_ad_account_id").eq("id", tenantId).maybeSingle();
  const raw = ((t as { meta_ad_account_id?: string | null } | null)?.meta_ad_account_id ?? "").trim();
  if (!raw) return Response.json({ error: "no Meta ad account on this client" }, { status: 409 });
  const account = raw.startsWith("act_") ? raw : `act_${raw}`;

  const token = await resolveMetaToken(ctx.env);
  if (!token) return Response.json({ error: "Meta not connected" }, { status: 503 });

  try {
    const rows = await graphGetAll(
      token,
      `/${account}/insights`,
      {
        level: q.level,
        date_preset: q.preset,
        fields: FIELDS[q.level],
        limit: "200",
        // The account's own attribution setting, as the Paid Ads pages read it.
        use_unified_attribution_setting: "true",
      },
      5,
      { strict: true },
    );
    return Response.json({ account, level: q.level, preset: q.preset, rows });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
};
