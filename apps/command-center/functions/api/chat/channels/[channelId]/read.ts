import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient, resolveTenantId } from "../../../../lib/supabase";
import { resolveParticipant, isChannelMember } from "../../../../lib/participants";
import { notifyParticipants } from "../../../../lib/chatRealtime";

export const onRequestPost: PagesFunction<Env, "channelId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant_not_found" }, { status: 404 });

  const { participant, needsIndividualAccount } = await resolveParticipant(client, {
    isOwner: Boolean(ctx.data.isOwner),
    staff: ctx.data.staff ?? null,
    admin: ctx.data.admin ?? null,
    tenantSlug: ctx.data.tenant.slug,
  });
  if (!participant) {
    return Response.json({ error: needsIndividualAccount ? "needs_individual_account" : "forbidden" }, { status: 403 });
  }

  const channelId = ctx.params.channelId as string;
  if (!(await isChannelMember(client, channelId, participant))) {
    return Response.json({ error: "not_a_member" }, { status: 403 });
  }

  const { error } = await client
    .from("chat_channel_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("channel_id", channelId)
    .eq("member_kind", participant.kind)
    .eq("member_id", participant.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Ping only the caller's other sessions; the read state is personal.
  ctx.waitUntil(
    notifyParticipants(ctx.env, [{ kind: participant.kind, id: participant.id }], {
      kind: "read",
      channelId,
    }),
  );

  return Response.json({ ok: true });
};
