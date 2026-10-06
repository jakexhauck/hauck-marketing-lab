import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { getTenantById, logAdminAction } from "../../../../../lib/adminAuth";
import { writeWithClaude } from "../../../../../lib/claude";
import { logAiRun } from "../../../../../lib/clientCopyStore";
import {
  CONTRACT_BUCKET,
  CONTRACT_COLUMNS,
  CONTRACT_READ_SCHEMA,
  CONTRACT_READ_SYSTEM,
  cleanFileName,
  contractUpdateFromRead,
  isContractRead,
  isTenantContractPath,
  toContractDto,
  type ContractRow,
} from "../../../../../lib/clientContract";

// POST /api/admin/clients/:tenantId/contract/read  { path?, name? }
//   -> { contract } | { contract, error }
//
// With `path` (a fresh upload): files that PDF on the client, then reads it.
// Without: re-reads the PDF already on file.
//
// Claude fetches the PDF itself from a 10 minute signed URL, so the Worker
// never holds the bytes. What it finds is SAVED straight to the row (that is
// the point: nothing to type), and every term stays editable on the rail.
//
// The file is kept even when the read fails, so a busy minute never loses the
// upload; the response then carries the error beside the filed contract.
//
// Owner only.

const SIGNED_SECONDS = 600;

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;
  const tenant = await getTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  const body = (await ctx.request.json().catch(() => ({}))) as { path?: unknown; name?: unknown };
  const now = new Date().toISOString();

  let path: string;
  if (body.path !== undefined) {
    if (!isTenantContractPath(tenantId, body.path)) {
      return Response.json({ error: "invalid path" }, { status: 400 });
    }
    path = body.path;
    const { error } = await client.from("client_billing").upsert(
      {
        tenant_id: tenantId,
        contract_file_path: path,
        contract_file_name: cleanFileName(body.name),
        contract_uploaded_at: now,
        updated_at: now,
      },
      { onConflict: "tenant_id" },
    );
    if (error) return Response.json({ error: error.message }, { status: 500 });
  } else {
    const { data } = await client
      .from("client_billing")
      .select("contract_file_path")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const filed = (data as { contract_file_path?: string } | null)?.contract_file_path ?? "";
    if (!isTenantContractPath(tenantId, filed)) {
      return Response.json({ error: "No contract on file" }, { status: 404 });
    }
    path = filed;
  }

  const fail = async (message: string) => {
    const { data } = await client
      .from("client_billing")
      .select(CONTRACT_COLUMNS)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    return Response.json(
      { contract: toContractDto(data as unknown as ContractRow), error: message },
      { status: 502 },
    );
  };

  const signed = await client.storage.from(CONTRACT_BUCKET).createSignedUrl(path, SIGNED_SECONDS);
  if (signed.error || !signed.data) return fail("Could not open the PDF");

  const result = await writeWithClaude(ctx.env, {
    system: CONTRACT_READ_SYSTEM,
    input: [
      { type: "document", source: { type: "url", url: signed.data.signedUrl } },
      { type: "text", text: "Pull the commercial terms out of this agreement." },
    ],
    schema: CONTRACT_READ_SCHEMA,
    check: isContractRead,
    maxTokens: 8000,
  });
  await logAiRun(client, {
    tenantId,
    kind: "contract.read",
    ok: result.ok,
    error: result.ok ? undefined : result.error,
    input: result.ok ? result.usage.input : 0,
    output: result.ok ? result.usage.output : 0,
  });
  if (!result.ok) return fail(result.error);
  if (!result.data.isContract) return fail("That PDF does not look like a contract");

  const update = contractUpdateFromRead(result.data);
  const { data, error } = await client
    .from("client_billing")
    .update({ ...update, contract_read_at: now, updated_at: now })
    .eq("tenant_id", tenantId)
    .select(CONTRACT_COLUMNS)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await logAdminAction(client, ctx.data.admin!.id, "client.contract.read", tenantId, { path });
  return Response.json({ contract: toContractDto(data as unknown as ContractRow) });
};
