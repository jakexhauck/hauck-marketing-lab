import type { SupabaseClient } from "@supabase/supabase-js";
import type { StaffRecord } from "./staff";
import type { AdminRecord } from "./adminAuth";

export type Participant = {
  kind: "staff" | "admin";
  id: string;
  tenantId: string | null;
  name: string;
};

// Turn the verified caller (set by _middleware) into a chat participant.
// needsIndividualAccount=true means a shared-owner session with no staff row; the
// caller must be given a personal owner account before they can use chat.
export async function resolveParticipant(
  _client: SupabaseClient,
  ctx: { isOwner: boolean; staff: StaffRecord | null; admin: AdminRecord | null; tenantSlug: string },
): Promise<{ participant: Participant | null; needsIndividualAccount: boolean }> {
  if (ctx.admin) {
    return {
      participant: { kind: "admin", id: ctx.admin.id, tenantId: null, name: ctx.admin.name },
      needsIndividualAccount: false,
    };
  }
  if (ctx.staff) {
    return {
      participant: {
        kind: "staff",
        id: ctx.staff.id,
        tenantId: ctx.staff.tenant_id,
        name: ctx.staff.name,
      },
      needsIndividualAccount: false,
    };
  }
  // Shared-owner session (isOwner, no staff row): no individual identity.
  return { participant: null, needsIndividualAccount: ctx.isOwner };
}

export async function isChannelMember(
  client: SupabaseClient,
  channelId: string,
  p: Participant,
): Promise<boolean> {
  const { data } = await client
    .from("chat_channel_members")
    .select("channel_id")
    .eq("channel_id", channelId)
    .eq("member_kind", p.kind)
    .eq("member_id", p.id)
    .maybeSingle();
  return Boolean(data);
}
