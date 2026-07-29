import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { getAccessToken, isConnected, DriveNotConnectedError } from "../../../lib/driveDirect";
import { buildSopTree } from "../../../lib/sopTree";

// GET /api/admin/sops — the SOP Hub tree, read live from Google Drive.
//
// SOP content is not stored here; the agency's "SOPs Templates" folder is the
// source of truth. Admin-only: gated centrally in api/_middleware.ts.
//
// Every failure mode returns a `status` the UI can render as plain English,
// because "not connected" and "wrong folder" need different fixes and a generic
// error would leave Jake guessing which. `connectedEmail` rides along on all of
// them: which Google account is linked is the difference between "the folder is
// empty" and "you consented as the wrong account", and the UI cannot tell those
// apart without being told.
//
// The SOPs tab polls this while it is open, so every answer here has to be one
// the browser can read. An expected, actionable state is therefore a 200 with a
// `status`, not an HTTP error: no_access used to be a 500, which made api()
// throw and collapsed the specific "wrong account" notice into a generic
// "Could not load SOPs". Only a genuinely unexpected failure returns 500.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const rootId = (ctx.env.SOP_DRIVE_FOLDER_ID ?? "").trim();
  if (!rootId) {
    return Response.json({ status: "not_configured", categories: [], connectedEmail: null });
  }

  const client = getServiceClient(ctx.env);
  if (!client) {
    return Response.json({ status: "not_configured", categories: [], connectedEmail: null });
  }

  // Read the connection before attempting a token refresh: an unconnected hub
  // can answer without touching Google at all.
  const { connected, email } = await isConnected(client);
  if (!connected) {
    return Response.json({
      status: "not_connected",
      categories: [],
      connectedEmail: null,
      error: "Google Drive is not connected yet.",
    });
  }

  try {
    const token = await getAccessToken(ctx.env, client);
    const categories = await buildSopTree(token, rootId);
    return Response.json({ status: "ok", categories, connectedEmail: email });
  } catch (err) {
    if (err instanceof DriveNotConnectedError) {
      return Response.json({ status: "not_connected", categories: [], connectedEmail: email, error: err.message });
    }
    const message = err instanceof Error ? err.message : "Could not read the SOP folder.";
    // A 403 here almost always means the connected Google account is not the one
    // that owns the SOP folder, which is worth saying out loud.
    if (/\(403\)/.test(message)) {
      return Response.json({ status: "no_access", categories: [], connectedEmail: email, error: message });
    }
    return Response.json({ status: "error", categories: [], connectedEmail: email, error: message }, { status: 500 });
  }
};
