import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient, resolveTenantId } from "../../../lib/supabase";
import { resolveParticipant } from "../../../lib/participants";

interface PatchChannelBody {
  name?: string;
  archived?: boolean;
  memberIds?: string[];
}

export const onRequestPatch: PagesFunction<Env, "channelId", ApiData> = async (ctx) => {
  if (!ctx.data.isOwner) return Response.json({ error: "forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant_not_found" }, { status: 404 });

  const { participant, needsIndividualAccount } = await resolveParticipant(client, {
    isOwner: ctx.data.isOwner ?? false,
    staff: ctx.data.staff ?? null,
    admin: ctx.data.admin ?? null,
    tenantSlug: ctx.data.tenant.slug,
  });
  if (!participant) {
    return Response.json({ error: needsIndividualAccount ? "needs_individual_account" : "forbidden" }, { status: 403 });
  }

  const channelId = ctx.params.channelId as string;
  const body = await readJsonBody<PatchChannelBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  // Confirm the channel exists in this tenant and is a managed channel (not a dm/hauck).
  const { data: chRow, error: chErr } = await client
    .from("chat_channels")
    .select("id, kind, created_by_kind, created_by_id")
    .eq("id", channelId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (chErr) return Response.json({ error: chErr.message }, { status: 500 });
  if (!chRow) return Response.json({ error: "channel_not_found" }, { status: 404 });
  const channel = chRow as {
    id: string;
    kind: "channel" | "dm" | "hauck";
    created_by_kind: string | null;
    created_by_id: string | null;
  };
  if (channel.kind !== "channel") {
    return Response.json({ error: "not_a_managed_channel" }, { status: 409 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.archived === "boolean") patch.archived = body.archived;
  if (Object.keys(patch).length > 0) {
    const { error: updErr } = await client
      .from("chat_channels")
      .update(patch)
      .eq("id", channelId)
      .eq("tenant_id", tenantId);
    if (updErr) return Response.json({ error: updErr.message }, { status: 500 });
  }

  // Membership replacement (only when memberIds was supplied).
  if (Array.isArray(body.memberIds)) {
    const requested = body.memberIds.filter((id: unknown) => typeof id === "string") as string[];

    const { data: staffRows, error: staffErr } = await client
      .from("staff_accounts")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .in("id", requested.length > 0 ? requested : ["00000000-0000-0000-0000-000000000000"]);
    if (staffErr) return Response.json({ error: staffErr.message }, { status: 500 });
    const validStaffIds = new Set(((staffRows ?? []) as { id: string }[]).map((s) => s.id));

    const keep = new Map<string, { member_kind: string; member_id: string }>();
    for (const id of requested) {
      if (validStaffIds.has(id)) keep.set(`staff:${id}`, { member_kind: "staff", member_id: id });
    }
    // Never drop the creator.
    if (channel.created_by_kind && channel.created_by_id) {
      keep.set(`${channel.created_by_kind}:${channel.created_by_id}`, {
        member_kind: channel.created_by_kind,
        member_id: channel.created_by_id,
      });
    }

    const { error: delErr } = await client
      .from("chat_channel_members")
      .delete()
      .eq("channel_id", channelId);
    if (delErr) return Response.json({ error: delErr.message }, { status: 500 });

    const rows = [...keep.values()].map((m) => ({
      channel_id: channelId,
      member_kind: m.member_kind,
      member_id: m.member_id,
    }));
    if (rows.length > 0) {
      const { error: insErr } = await client.from("chat_channel_members").insert(rows);
      if (insErr) return Response.json({ error: insErr.message }, { status: 500 });
    }
  }

  return Response.json({ ok: true });
};
