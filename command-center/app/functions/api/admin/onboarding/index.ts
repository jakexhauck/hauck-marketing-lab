import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { isRetiredTenant } from "../../../lib/retiredTenant";

// GET /api/admin/onboarding  (admin-only, gated in _middleware.ts)
//
// Every client, with the four things a row on the Onboarding list shows: who
// they are, what they do, where they are, and whether they are still being set
// up. The page filters to the ones in setup; the whole roster is returned so
// that reopening a client who has already gone live needs no second request.
//
// Each client also carries what the wizard's roster needs to draw its progress
// bar without a request per client: the Software setup choices and the ids of the steps
// ticked. The browser counts them against the live step list, so a step removed
// in Settings stops counting without anything here changing.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data: tenants, error } = await client
    .from("tenants")
    .select(
      "id, name, slug, niche, brand_color, brand_initials, onboarding_status, onboarding_bundle, onboarding_dialer, software_live_at",
    )
    .order("created_at", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // The town they are in comes from their own intake answers, so a client who
  // has not filled the form in simply has no location line rather than a
  // placeholder pretending to be one.
  const { data: ob } = await client.from("onboarding").select("tenant_id, intake");
  const intakeById = new Map(
    ((ob ?? []) as { tenant_id: string; intake: Record<string, string> | null }[]).map((r) => [
      r.tenant_id,
      r.intake ?? {},
    ]),
  );

  // Which clients already have their Drive folder, for the Create client
  // folder button. One row per client at most in practice; a handful total.
  const { data: folders, error: folderErr } = await client
    .from("client_folders")
    .select("tenant_id, folder_id, web_view_link")
    .not("tenant_id", "is", null);
  if (folderErr) return Response.json({ error: folderErr.message }, { status: 500 });
  const folderById = new Map<string, string>();
  for (const f of (folders ?? []) as { tenant_id: string; folder_id: string; web_view_link: string | null }[]) {
    folderById.set(f.tenant_id, f.web_view_link ?? `https://drive.google.com/drive/folders/${f.folder_id}`);
  }

  // Only clients still being set up draw a progress bar, and scoping the read
  // to them keeps it far under PostgREST's silent 1000-row cap.
  const setupIds = ((tenants ?? []) as { id: string; onboarding_status: string | null }[])
    .filter((t) => t.onboarding_status === "setup")
    .map((t) => t.id);
  const { data: ticks, error: tickErr } = setupIds.length
    ? await client
        .from("onboarding_checklist")
        .select("tenant_id, task_key")
        .eq("done", true)
        .in("tenant_id", setupIds)
    : { data: [], error: null };
  if (tickErr) return Response.json({ error: tickErr.message }, { status: 500 });
  const doneById = new Map<string, string[]>();
  for (const t of (ticks ?? []) as { tenant_id: string; task_key: string }[]) {
    const list = doneById.get(t.tenant_id) ?? [];
    list.push(t.task_key);
    doneById.set(t.tenant_id, list);
  }

  const clients = (
    (tenants ?? []) as {
      id: string;
      name: string;
      slug: string;
      niche: string | null;
      brand_color: string | null;
      brand_initials: string | null;
      onboarding_status: string | null;
      onboarding_bundle: string | null;
      onboarding_dialer: string | null;
      software_live_at: string | null;
    }[]
  )
    // Same rule as /api/admin/clients: a retired account is not a client.
    .filter((t) => !isRetiredTenant(t))
    .map((t) => {
    const intake = intakeById.get(t.id) ?? {};
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      niche: t.niche ?? "",
      brandColor: t.brand_color ?? "",
      brandInitials: t.brand_initials ?? "",
      city: (intake.addressCity ?? "").trim(),
      region: (intake.addressState ?? "").trim(),
      // 'setup' while they are still being stood up, 'live' once Go live has
      // been pressed, 'removed' once deleted from Onboarding. The lists are
      // built on this: it stopped gating the client app in 2026-08.
      onboardingStatus: t.onboarding_status ?? "live",
      bundle: t.onboarding_bundle,
      dialer: t.onboarding_dialer,
      softwareLiveAt: t.software_live_at,
      driveFolderUrl: folderById.get(t.id) ?? null,
      doneKeys: doneById.get(t.id) ?? [],
    };
  });

  return Response.json({ clients });
};
