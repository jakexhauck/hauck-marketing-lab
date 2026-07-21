import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { getAccessToken, DriveNotConnectedError } from "../../../lib/driveDirect";
import { buildSopTree } from "../../../lib/sopTree";

// GET /api/admin/sops — the SOP Hub tree, read live from Google Drive.
//
// SOP content is not stored here; the agency's "SOPs Templates" folder is the
// source of truth. Admin-only: gated centrally in api/_middleware.ts.
//
// Every failure mode returns a `status` the UI can render as plain English,
// because "not connected" and "wrong folder" need different fixes and a generic
// error would leave Jake guessing which.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const rootId = (ctx.env.SOP_DRIVE_FOLDER_ID ?? "").trim();
  if (!rootId) {
    return Response.json({ status: "not_configured", categories: [] });
  }

  const client = getServiceClient(ctx.env);
  if (!client) {
    return Response.json({ status: "not_configured", categories: [] });
  }

  try {
    const token = await getAccessToken(ctx.env, client);
    const categories = await buildSopTree(token, rootId);
    return Response.json({ status: "ok", categories });
  } catch (err) {
    if (err instanceof DriveNotConnectedError) {
      return Response.json({ status: "not_connected", categories: [], error: err.message });
    }
    const message = err instanceof Error ? err.message : "Could not read the SOP folder.";
    // A 403 here almost always means the connected Google account is not the one
    // that owns the SOP folder, which is worth saying out loud.
    const status = /\(403\)/.test(message) ? "no_access" : "error";
    return Response.json({ status, categories: [], error: message }, { status: 500 });
  }
};
