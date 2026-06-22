import type { Env, ApiData } from "../../lib/env";
import { readJsonBody } from "../../lib/body";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";
import { resolveParticipant } from "../../lib/participants";

interface DmBody {
  memberId?: string;
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
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
    return Response.json(
      { error: needsIndividualAccount ? "needs_individual_account" : "forbidden" },
      { status: 403 },
    );
  }

  const body = await readJsonBody<DmBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  const targetId = (body.memberId ?? "").trim();
  if (!targetId) return Response.json({ error: "member_id_required" }, { status: 400 });
  if (targetId === participant.id) return Response.json({ error: "cannot_dm_self" }, { status: 400 });

  // Target must be an active staff row in the same tenant.
  const { data: target, error: targetErr } = await client
    .from("staff_accounts")
    .select("id")
    .eq("id", targetId)
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .maybeSingle();
  if (targetErr) return Response.json({ error: targetErr.message }, { status: 500 });
  if (!target) return Response.json({ error: "member_not_found" }, { status: 404 });

  // Existing dm: a dm channel the caller belongs to whose membership is exactly the pair.
  const { data: myDmMemberships, error: memErr } = await client
    .from("chat_channel_members")
    .select("channel_id, chat_channels!inner(id, kind, tenant_id)")
    .eq("member_kind", participant.kind)
    .eq("member_id", participant.id)
    .eq("chat_channels.kind", "dm")
    .eq("chat_channels.tenant_id", tenantId);
  if (memErr) return Response.json({ error: memErr.message }, { status: 500 });

  const candidateIds = ((myDmMemberships ?? []) as { channel_id: string }[]).map((m) => m.channel_id);
  if (candidateIds.length > 0) {
    const { data: allMembers, error: amErr } = await client
      .from("chat_channel_members")
      .select("channel_id, member_kind, member_id")
      .in("channel_id", candidateIds);
    if (amErr) return Response.json({ error: amErr.message }, { status: 500 });

    const byChannel = new Map<string, Set<string>>();
    for (const m of (allMembers ?? []) as { channel_id: string; member_kind: string; member_id: string }[]) {
      const set = byChannel.get(m.channel_id) ?? new Set<string>();
      set.add(`${m.member_kind}:${m.member_id}`);
      byChannel.set(m.channel_id, set);
    }
    const want = new Set([`${participant.kind}:${participant.id}`, `staff:${targetId}`]);
    for (const [cid, set] of byChannel) {
      if (set.size === 2 && [...want].every((k) => set.has(k))) {
        return Response.json({
          channel: { id: cid, kind: "dm", name: "", memberIds: [participant.id, targetId], unread: 0, lastMessageAt: null },
        });
      }
    }
  }

  // Create the dm and both memberships.
  const { data: created, error: chErr } = await client
    .from("chat_channels")
    .insert({
      tenant_id: tenantId,
      name: "",
      kind: "dm",
      created_by_kind: participant.kind,
      created_by_id: participant.id,
    })
    .select("id")
    .single();
  if (chErr) return Response.json({ error: chErr.message }, { status: 500 });
  const channelId = (created as { id: string }).id;

  const { error: insErr } = await client.from("chat_channel_members").insert([
    { channel_id: channelId, member_kind: participant.kind, member_id: participant.id },
    { channel_id: channelId, member_kind: "staff", member_id: targetId },
  ]);
  if (insErr) return Response.json({ error: insErr.message }, { status: 500 });

  return Response.json({
    channel: { id: channelId, kind: "dm", name: "", memberIds: [participant.id, targetId], unread: 0, lastMessageAt: null },
  });
};
