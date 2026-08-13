import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";

// GET /api/admin/onboarding  (admin-only, gated in _middleware.ts)
//
// Every client, with the four things a row on the Onboarding list shows: who
// they are, what they do, where they are, and whether they are still being set
// up. The page filters to the ones in setup; the whole roster is returned so
// that reopening a client who has already gone live needs no second request.
//
// This used to count each client's checklist. The checklist went with the
// redesign: the process lives in Jake's SOPs, and a second copy inside the app
// was one to maintain and one to ignore. What survived is the record of what the
// client told us, which is the part nothing else in the app holds.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data: tenants, error } = await client
    .from("tenants")
    .select("id, name, slug, niche, brand_color, brand_initials, onboarding_status")
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

  const clients = (
    (tenants ?? []) as {
      id: string;
      name: string;
      slug: string;
      niche: string | null;
      brand_color: string | null;
      brand_initials: string | null;
      onboarding_status: string | null;
    }[]
  ).map((t) => {
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
      // 'setup' while they are held at the holding screen, 'live' once Go live
      // has been pressed. The list is built on this.
      onboardingStatus: t.onboarding_status ?? "live",
    };
  });

  return Response.json({ clients });
};
