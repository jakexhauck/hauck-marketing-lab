import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { slugify } from "../../../lib/leadScraper";

// GET    /api/admin/leads/presets -> the niches the wizard can run
// POST   /api/admin/leads/presets -> save a new one, or overwrite one of yours
// DELETE /api/admin/leads/presets -> remove one of yours
//
// A niche is the four word lists the SOP tells you to swap and nothing else: the
// keywords you search, the categories that can only mean your work, the deny list,
// and the name signals. The machine that reads them never changes.
//
// built_in presets ship with the runner (lead-scraper/niches/*.json) and are seeded
// by scripts/seed-niches.mjs. They cannot be deleted, because deleting the only
// niche would leave the wizard with nothing to run.

const SELECT = "id, niche_id, label, spec, built_in, created_at, updated_at";

interface PresetRow {
  id: string;
  niche_id: string;
  label: string;
  spec: Record<string, unknown>;
  built_in: boolean;
  created_at: string;
  updated_at: string;
}

function shape(row: PresetRow) {
  const spec = row.spec ?? {};
  const list = (key: string) => (Array.isArray(spec[key]) ? (spec[key] as unknown[]) : []);
  const signals = spec.name_signals;
  return {
    id: row.id,
    nicheId: row.niche_id,
    label: row.label,
    builtIn: row.built_in,
    spec,
    // A summary so the wizard can show what a preset actually does without
    // rendering four word lists at somebody choosing a button.
    summary: {
      keywords: list("keywords").length,
      denyTerms: list("deny").length + list("recurring_deny").length,
      coreCategories: list("allow_core").length,
      nameSignals: Array.isArray(signals)
        ? signals.length
        : signals && typeof signals === "object"
          ? Object.keys(signals as object).length
          : 0,
      threshold: typeof spec.export_threshold === "number" ? spec.export_threshold : 50,
    },
    updatedAt: row.updated_at,
  };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data, error } = await client
    .from("lead_niche_presets")
    .select(SELECT)
    .order("built_in", { ascending: false })
    .order("label", { ascending: true });

  if (error) {
    console.error("[leads/presets] read failed", error.message);
    return Response.json({ error: "could not read the niches" }, { status: 500 });
  }

  return Response.json({ presets: ((data ?? []) as PresetRow[]).map(shape) });
};

interface PostBody {
  label?: unknown;
  nicheId?: unknown;
  keywords?: unknown;
  deny?: unknown;
  allowCore?: unknown;
  nameSignals?: unknown;
  basedOn?: unknown;
}

// One term per line or comma, trimmed, lowercased, de-duplicated, blanks dropped.
// Lowercase because the qualifier lowercases everything it compares against, so a
// capitalised deny term would simply never match and would look like it worked.
function cleanTerms(value: unknown, max = 300): string[] {
  const raw =
    typeof value === "string"
      ? value.split(/[\n,]/)
      : Array.isArray(value)
        ? value.map((v) => String(v ?? ""))
        : [];
  const out = new Set<string>();
  for (const term of raw) {
    const t = term.trim().toLowerCase().slice(0, 60);
    if (t) out.add(t);
  }
  return [...out].slice(0, max);
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const body = await readJsonBody<PostBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const label = typeof body.label === "string" ? body.label.trim().slice(0, 80) : "";
  if (!label) return Response.json({ error: "Give the niche a name." }, { status: 400 });

  const nicheId = slugify(typeof body.nicheId === "string" && body.nicheId ? body.nicheId : label);
  if (!nicheId) return Response.json({ error: "That name cannot be used." }, { status: 400 });

  const keywords = cleanTerms(body.keywords, 40);
  if (keywords.length === 0) {
    return Response.json(
      { error: "Add at least one search term, the kind a customer would type." },
      { status: 400 },
    );
  }

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  // Start from an existing niche when one is named, so a new trade inherits the
  // venue words, the whole-word guards and the category rules rather than being
  // built from nothing. The SOP's point exactly: the structure is the product.
  let base: Record<string, unknown> = {};
  const basedOn = typeof body.basedOn === "string" ? body.basedOn.trim() : "";
  if (basedOn) {
    const { data: parent } = await client
      .from("lead_niche_presets")
      .select("spec")
      .eq("niche_id", basedOn)
      .maybeSingle();
    if (parent) base = { ...((parent as { spec: Record<string, unknown> }).spec ?? {}) };
  }

  const allowCore = cleanTerms(body.allowCore, 60);
  const deny = cleanTerms(body.deny, 300);
  const nameSignals = cleanTerms(body.nameSignals, 60);

  const spec: Record<string, unknown> = {
    ...base,
    id: nicheId,
    label,
    export_threshold: typeof base.export_threshold === "number" ? base.export_threshold : 50,
    max_reviews: typeof base.max_reviews === "number" ? base.max_reviews : 120,
    keywords,
  };
  // Only replace a list the caller actually supplied: an empty deny list from a
  // half-filled form must not wipe the inherited one and open the junk gate.
  if (allowCore.length) spec.allow_core = allowCore;
  if (deny.length) spec.deny = [...new Set([...(base.deny as string[] ?? []), ...deny])];
  if (nameSignals.length) spec.name_signals = nameSignals;

  const { data: existing } = await client
    .from("lead_niche_presets")
    .select("id, built_in")
    .eq("niche_id", nicheId)
    .maybeSingle();

  if (existing && (existing as { built_in: boolean }).built_in) {
    return Response.json(
      { error: "That is a built-in niche. Save it under a different name." },
      { status: 409 },
    );
  }

  const { data, error } = await client
    .from("lead_niche_presets")
    .upsert(
      {
        niche_id: nicheId,
        label,
        spec,
        built_in: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "niche_id" },
    )
    .select(SELECT)
    .single();

  if (error || !data) {
    console.error("[leads/presets] upsert failed", error?.message);
    return Response.json({ error: "could not save that niche" }, { status: 500 });
  }

  await logAdminAction(client, ctx.data.admin!.id, "leads.preset.save", null, {
    nicheId,
    keywords: keywords.length,
  });

  return Response.json({ preset: shape(data as PresetRow) }, { status: 201 });
};

export const onRequestDelete: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const nicheId = (url.searchParams.get("nicheId") ?? "").trim();
  if (!nicheId) return Response.json({ error: "nicheId is required" }, { status: 400 });

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data: row } = await client
    .from("lead_niche_presets")
    .select("built_in")
    .eq("niche_id", nicheId)
    .maybeSingle();

  if (!row) return Response.json({ error: "no such niche" }, { status: 404 });
  if ((row as { built_in: boolean }).built_in) {
    return Response.json({ error: "Built-in niches cannot be deleted." }, { status: 409 });
  }

  const { error } = await client.from("lead_niche_presets").delete().eq("niche_id", nicheId);
  if (error) {
    console.error("[leads/presets] delete failed", error.message);
    return Response.json({ error: "could not remove that niche" }, { status: 500 });
  }

  await logAdminAction(client, ctx.data.admin!.id, "leads.preset.delete", null, { nicheId });
  return Response.json({ ok: true });
};
