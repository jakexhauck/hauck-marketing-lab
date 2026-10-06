import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { getTenantById, logAdminAction } from "../../../../../lib/adminAuth";
import {
  CONTRACT_COLUMNS,
  buildContractUpdate,
  emptyContractDto,
  toContractDto,
  type ContractRow,
} from "../../../../../lib/clientContract";

// GET   /api/admin/clients/:tenantId/contract -> { contract }
// PATCH /api/admin/clients/:tenantId/contract -> { contract }
//
// Management's Contract rail (0148). The terms live on client_billing's
// contract_* columns; this route only ever reads or writes those, so the rail
// and the Billing cards' own Save cannot overwrite each other.
//
// Owner only, checked here as well as by the /api/admin gate.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;

  const { data, error } = await client
    .from("client_billing")
    .select(CONTRACT_COLUMNS)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    contract: data ? toContractDto(data as unknown as ContractRow) : emptyContractDto(),
  });
};

export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;
  const tenant = await getTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  const body = await ctx.request.json().catch(() => null);
  const result = buildContractUpdate(body);
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });

  const { data, error } = await client
    .from("client_billing")
    .upsert(
      { ...result.update, tenant_id: tenantId, updated_at: new Date().toISOString() },
      { onConflict: "tenant_id" },
    )
    .select(CONTRACT_COLUMNS)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await logAdminAction(client, ctx.data.admin!.id, "client.contract.edit", tenantId, result.update);
  return Response.json({ contract: toContractDto(data as unknown as ContractRow) });
};
