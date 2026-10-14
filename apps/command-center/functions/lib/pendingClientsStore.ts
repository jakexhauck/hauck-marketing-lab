import type { SupabaseClient } from "@supabase/supabase-js";
import { BILLING_COLUMNS, type BillingRow } from "./clientBilling";
import { matchPendingClient, type MatchKeys } from "./pendingClients";

// The I/O half of pendingClients.ts: reading a waiting row and moving it onto
// a real client. Shared by the tracker endpoints and intake approval so there
// is one definition of what "attach" writes.

export const PENDING_COLUMNS = `id, sales_call_id, tenant_id, business_name, email, phone, ${BILLING_COLUMNS}`;

export type PendingRow = BillingRow & {
  id: string;
  sales_call_id: string;
  tenant_id: string | null;
  business_name: string;
  email: string;
  phone: string;
};

// The tracker columns, as client_billing names them.
const TRACKER_KEYS = [
  "first_name",
  "last_name",
  "source",
  "date_closed",
  "service",
  "payment_arrangement",
  "upfront_cash",
  "remaining_cash",
  "total_cash_collected",
  "billing_date",
  "renewal_date",
  "last_touchpoint",
  "churn_date",
  "status",
  "notes",
  "ad_tracking_sheet",
] as const;

// Move a waiting row onto a client. Only answered fields are copied, so
// linking to a client whose row was already part typed fills the gaps and
// overwrites only what the close actually said.
export async function attachPendingClient(
  client: SupabaseClient,
  row: PendingRow,
  tenantId: string,
): Promise<string | null> {
  const update: Record<string, unknown> = {};
  for (const key of TRACKER_KEYS) {
    const value = row[key];
    if (value !== "" && value !== 0 && value !== null && value !== undefined) update[key] = value;
  }
  const now = new Date().toISOString();

  const { error: billErr } = await client
    .from("client_billing")
    .upsert({ ...update, tenant_id: tenantId, updated_at: now }, { onConflict: "tenant_id" });
  if (billErr) return billErr.message;

  const { error } = await client
    .from("pending_clients")
    .update({ tenant_id: tenantId, updated_at: now })
    .eq("id", row.id);
  return error ? error.message : null;
}

// Intake approval's hook: find the closed meeting this new client came from
// and attach its tracker row. Best effort; returns a warning, never throws.
export async function attachOnApprove(
  client: SupabaseClient,
  tenantId: string,
  keys: MatchKeys,
): Promise<string | undefined> {
  try {
    const { data, error } = await client
      .from("pending_clients")
      .select(PENDING_COLUMNS)
      .is("tenant_id", null)
      .order("created_at", { ascending: false });
    if (error) return `Client Tracker row not attached: ${error.message}`;
    const rows = (data ?? []) as unknown as PendingRow[];
    const id = matchPendingClient(
      rows.map((r) => ({ id: r.id, email: r.email, phone: r.phone, businessName: r.business_name })),
      keys,
    );
    if (!id) return undefined;
    const err = await attachPendingClient(client, rows.find((r) => r.id === id)!, tenantId);
    return err ? `Client Tracker row not attached: ${err}` : undefined;
  } catch (e) {
    return `Client Tracker row not attached: ${e instanceof Error ? e.message : String(e)}`;
  }
}
