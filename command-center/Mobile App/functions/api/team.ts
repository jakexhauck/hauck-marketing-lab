import type { Env, ApiData } from "../lib/env";
import { ghlJson } from "../lib/ghl";

interface GhlUser {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

interface GhlUsersResp {
  users?: GhlUser[];
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
}

// GET /api/team
// Returns the sub-account's real GHL team. Tenant creds come from the
// middleware (ctx.data.tenant), never from env tokens directly.
//
// Note: if the GHL token lacks the users scope this call 403s. A tokenless
// fallback is to derive the team from distinct opportunity `assignedTo` ids
// (less complete: no names/emails), which we can add later if needed.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (
  ctx,
) => {
  const t = ctx.data.tenant;
  const gctx = { token: t.ghl_token, locationId: t.ghl_location_id };

  const data = await ghlJson<GhlUsersResp>(
    gctx,
    `/users/?locationId=${encodeURIComponent(t.ghl_location_id)}`,
  );

  const team: TeamMember[] = (data.users ?? []).map((u) => ({
    id: u.id,
    name:
      u.name ||
      [u.firstName, u.lastName].filter(Boolean).join(" ").trim() ||
      "Unknown",
    email: u.email ?? "",
  }));

  return Response.json({ team });
};
