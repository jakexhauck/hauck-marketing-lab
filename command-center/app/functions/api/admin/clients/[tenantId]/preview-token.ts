import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { getTenantById, logAdminAction } from "../../../../lib/adminAuth";
import {
  PREVIEW_TOKEN_MAX_AGE_SECONDS,
  mintPreviewSessionToken,
} from "../../../../lib/session";

// POST /api/admin/clients/:tenantId/preview-token  (admin-only, gated in _middleware.ts)
//
// Mints a read-only preview token and returns it in the BODY. Unlike the sibling
// /preview route, this sets no cookie, so the calling admin's own session is
// left completely intact. That is the whole point: the Fulfillment "Software"
// tab frames the live client app inside an admin page, and the admin shell
// around the frame has to survive.
//
// The token is the same signed preview token the cookie route mints (it carries
// the preview flag), so every existing protection applies with no new code:
//   - _middleware refuses any non-GET on a preview session (read-only)
//   - _middleware keeps a preview session out of every /api/admin/* route
//   - verifySession only accepts it via the x-preview-token header, and only
//     accepts preview tokens there
//
// Shorter-lived than the 2h cookie preview (15 minutes) because this value
// travels to the frame in a URL fragment. The client re-mints as needed.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await getTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  const adminId = ctx.data.admin!.id;
  const token = await mintPreviewSessionToken(
    ctx.env,
    adminId,
    tenantId,
    // Always the owner's-eye view: the Software tab is an inventory of every
    // page, so it must not be narrowed by one staff member's permissions.
    undefined,
    PREVIEW_TOKEN_MAX_AGE_SECONDS,
  );

  await logAdminAction(client, adminId, "client.preview_token", tenantId, {});

  return Response.json({
    token,
    expiresInSeconds: PREVIEW_TOKEN_MAX_AGE_SECONDS,
  });
};
