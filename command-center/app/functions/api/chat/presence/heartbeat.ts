import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient, resolveTenantId } from "../../../lib/supabase";
import { resolveParticipant } from "../../../lib/participants";

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  const { participant } = await resolveParticipant(client, {
    isOwner: ctx.data.isOwner ?? false,
    staff: ctx.data.staff ?? null,
    admin: ctx.data.admin ?? null,
    tenantSlug: ctx.data.tenant.slug,
  });
  // Only tenant-scoped staff appear in a roster; admins (no tenantId) no-op.
  if (!participant || participant.kind !== "staff") return Response.json({ ok: true });
  const tenantId = participant.tenantId ?? (await resolveTenantId(client, ctx.data.tenant.slug));
  if (!tenantId) return Response.json({ ok: true });
  const { error } = await client.from("chat_presence").upsert(
    {
      tenant_id: tenantId,
      member_kind: "staff",
      member_id: participant.id,
      last_seen: new Date().toISOString(),
    },
    { onConflict: "tenant_id,member_kind,member_id" },
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
};
