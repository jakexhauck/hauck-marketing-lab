import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdDayUpsert } from "./metaAdDays";
import { selectAllPages } from "./pagedSelect";

// Write one date range of the Meta snapshot so it ends up EXACTLY what Meta
// just said about those days: every row Meta returned upserted, and every
// stored row in the range that Meta no longer returned deleted.
//
// Upsert alone is not enough. Meta omits a row when an ad's figures for a day
// are zero, so an ad whose spend Meta later refunds to nothing simply vanishes
// from the response, and an upsert-only sync keeps the old figure forever.
//
// Deletes go by key, not by "updated_at older than this run". Two syncs running
// at once (the cron and a page view) would otherwise delete each other's fresh
// rows, since the second upsert rewrites updated_at behind the first one's
// back.
//
// The caller must pass the COMPLETE Meta answer for [since, until]. Pass a
// partial one and this deletes real data; that is why the Meta fetch is strict.

const CHUNK = 500;
const DELETE_CHUNK = 200;

export function adDayKey(date: string, adId: string): string {
  return `${date}|${adId}`;
}

// The stored rows in the range that Meta did not return. Pure, for the test.
export function staleRowIds(
  stored: { id: string; date: string; ad_id: string }[],
  upserts: Pick<AdDayUpsert, "date" | "ad_id">[],
): string[] {
  const keep = new Set(upserts.map((u) => adDayKey(u.date, u.ad_id)));
  return stored.filter((r) => !keep.has(adDayKey(r.date, r.ad_id))).map((r) => r.id);
}

export async function replaceAdDays(
  client: SupabaseClient,
  tenantId: string,
  since: string,
  until: string,
  upserts: AdDayUpsert[],
): Promise<{ written: number; deleted: number }> {
  for (const u of upserts) {
    if (u.tenant_id !== tenantId || u.date < since || u.date > until) {
      throw new Error(`ad day ${u.date}/${u.ad_id} is outside ${since}..${until} for this client`);
    }
  }

  const now = new Date().toISOString();
  for (let i = 0; i < upserts.length; i += CHUNK) {
    const chunk = upserts.slice(i, i + CHUNK).map((r) => ({ ...r, updated_at: now }));
    const { error } = await client
      .from("meta_ad_days")
      .upsert(chunk, { onConflict: "tenant_id,date,ad_id" });
    if (error) throw new Error(error.message);
  }

  const stored = await selectAllPages<{ id: string; date: string; ad_id: string }>((from, to) =>
    client
      .from("meta_ad_days")
      .select("id, date, ad_id")
      .eq("tenant_id", tenantId)
      .gte("date", since)
      .lte("date", until)
      .order("date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );

  const stale = staleRowIds(stored, upserts);
  for (let i = 0; i < stale.length; i += DELETE_CHUNK) {
    const { error } = await client
      .from("meta_ad_days")
      .delete()
      .in("id", stale.slice(i, i + DELETE_CHUNK));
    if (error) throw new Error(error.message);
  }

  return { written: upserts.length, deleted: stale.length };
}
