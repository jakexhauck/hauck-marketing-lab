import type { SupabaseClient } from "@supabase/supabase-js";

// Writing one activity_log row, idempotently.
//
// Shared by both webhook endpoints (the legacy workflow one and the Marketplace
// app one) because both can be retried by GHL and both must produce exactly one
// feed row and exactly one push per real event.

// Insert one activity_log row, idempotently when a GHL event id is present.
// Returns true only when a NEW row was created, so the caller pushes exactly
// once even if GHL retries. Dedup relies on the unique (tenant_id, ghl_event_id)
// index from migration 0012; if that column/index is not present yet the upsert
// errors and we fall back to a plain insert (the prior behaviour), so the
// webhook never breaks on an un-migrated database.
export async function insertActivityOnce(
  client: SupabaseClient,
  row: Record<string, unknown>,
  eventId: string | null,
): Promise<boolean> {
  if (eventId) {
    const { data, error } = await client
      .from("activity_log")
      .upsert(
        { ...row, ghl_event_id: eventId },
        { onConflict: "tenant_id,ghl_event_id", ignoreDuplicates: true },
      )
      .select("id");
    if (!error) {
      // ignoreDuplicates => an already-seen event returns no rows.
      return Array.isArray(data) && data.length > 0;
    }
    console.warn(
      "[webhook] idempotent insert unavailable, falling back to plain insert:",
      error.message,
    );
  }
  const { error } = await client.from("activity_log").insert(row);
  if (error) {
    console.error("[webhook] activity insert failed", error.message);
    return false;
  }
  return true;
}
