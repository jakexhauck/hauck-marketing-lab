import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { CONTRACT_BUCKET, isTenantContractPath } from "../../../../../lib/clientContract";

// GET /api/admin/clients/:tenantId/contract/file -> { url }
//
// Open PDF on the Contract rail: a 5 minute signed link to the filed contract.
// Asked for on click rather than carried on the record, so a link copied out
// of a tab is dead within minutes.
//
// Owner only.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;

  const { data } = await client
    .from("client_billing")
    .select("contract_file_path, contract_file_name")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const row = data as { contract_file_path?: string; contract_file_name?: string } | null;
  const path = row?.contract_file_path ?? "";
  if (!isTenantContractPath(tenantId, path)) {
    return Response.json({ error: "No contract on file" }, { status: 404 });
  }

  const signed = await client.storage
    .from(CONTRACT_BUCKET)
    .createSignedUrl(path, 300, { download: false });
  if (signed.error || !signed.data) {
    return Response.json({ error: signed.error?.message ?? "could not sign" }, { status: 500 });
  }
  return Response.json({ url: signed.data.signedUrl });
};
