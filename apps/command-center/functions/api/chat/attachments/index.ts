import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient, resolveTenantId } from "../../../lib/supabase";
import { resolveParticipant } from "../../../lib/participants";

// Mirror src/lib/chatLogic.ts exactly. Server cannot import from src/, so the
// allowed set and ceiling are duplicated here. Keep them in lockstep.
const ATTACH_MAX_BYTES = 25 * 1024 * 1024;
const ATTACH_ALLOWED = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

interface RegisterBody {
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (
  ctx,
) => {
  const client = getServiceClient(ctx.env);
  if (!client) {
    return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  }

  const { participant, needsIndividualAccount } = await resolveParticipant(
    client,
    {
      isOwner: Boolean(ctx.data.isOwner),
      staff: ctx.data.staff ?? null,
      admin: ctx.data.admin ?? null,
      tenantSlug: ctx.data.tenant.slug,
    },
  );
  if (!participant) {
    return Response.json(
      {
        error: needsIndividualAccount
          ? "needs_individual_account"
          : "no_identity",
      },
      { status: 403 },
    );
  }

  let body: RegisterBody = {};
  try {
    body = (await ctx.request.json()) as RegisterBody;
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const fileName = (body.fileName ?? "").trim();
  const mimeType = (body.mimeType ?? "").trim();
  const sizeBytes = Number(body.sizeBytes);
  if (!fileName || !mimeType || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return Response.json({ error: "invalid_attachment" }, { status: 400 });
  }
  if (!ATTACH_ALLOWED.has(mimeType)) {
    return Response.json({ error: "unsupported_type" }, { status: 415 });
  }
  if (sizeBytes > ATTACH_MAX_BYTES) {
    return Response.json({ error: "too_large" }, { status: 413 });
  }

  // Admins (Jake) have no tenant; the row needs a tenant id, so admins resolve
  // it from the session slug they are acting under.
  const tenantId =
    participant.tenantId ?? (await resolveTenantId(client, ctx.data.tenant.slug));
  if (!tenantId) {
    return Response.json({ error: "tenant_not_found" }, { status: 500 });
  }

  const attachmentId = crypto.randomUUID();
  const storagePath = `${tenantId}/${attachmentId}/${fileName}`;

  const { error: insertErr } = await client.from("chat_attachments").insert({
    id: attachmentId,
    message_id: null,
    tenant_id: tenantId,
    uploader_kind: participant.kind,
    uploader_id: participant.id,
    file_name: fileName,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    storage_path: storagePath,
  });
  if (insertErr) {
    return Response.json({ error: insertErr.message }, { status: 500 });
  }

  const { data: signed, error: signErr } = await client.storage
    .from("chat-attachments")
    .createSignedUploadUrl(storagePath);
  if (signErr || !signed) {
    // Roll back the orphan row so a failed upload does not leave dangling metadata.
    await client.from("chat_attachments").delete().eq("id", attachmentId);
    return Response.json(
      { error: signErr?.message ?? "sign_failed" },
      { status: 500 },
    );
  }

  return Response.json({
    attachmentId,
    uploadUrl: signed.signedUrl,
    path: signed.path,
    token: signed.token,
  });
};
