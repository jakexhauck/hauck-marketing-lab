import type { Env, ApiData } from "../../lib/env";

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const url = ctx.env.SUPABASE_URL ?? "";
  const anonKey = ctx.env.SUPABASE_ANON_KEY ?? "";
  if (!url || !anonKey) {
    return Response.json({ error: "realtime_not_configured" }, { status: 503 });
  }
  // A legacy shared-owner session (owner, but no individual staff row) has no
  // chat identity, so it must not receive a tenantId or join the presence
  // channel. Refuse it here, matching resolveParticipant's needsIndividualAccount.
  if (ctx.data.isOwner && !ctx.data.staff && !ctx.data.admin) {
    return Response.json({ error: "needs_individual_account" }, { status: 403 });
  }
  // Staff carry tenant_id directly; admins have no tenant presence channel.
  const tenantId: string | null = ctx.data.staff?.tenant_id ?? null;
  return Response.json({ url, anonKey, tenantId });
};
