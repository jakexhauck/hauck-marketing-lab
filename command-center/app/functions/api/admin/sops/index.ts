import type { Env, ApiData } from "../../../lib/env";
import { DriveNotConnectedError } from "../../../lib/driveDirect";
import {
  composioDriveConfigured,
  connectedEmail,
  listFolderChildren,
  resolveDriveAccount,
} from "../../../lib/driveComposio";
import { buildSopTree } from "../../../lib/sopTree";

// GET /api/admin/sops — the SOP Hub tree, read live from Google Drive.
//
// SOP content is not stored here; the agency's "SOPs Templates" folder is the
// source of truth. Admin-only: gated centrally in api/_middleware.ts.
//
// Drive is reached through Composio rather than an OAuth grant of our own. The
// agency's own Google Cloud consent screen is in Testing, which caps access to a
// tester list and expires refresh tokens weekly, and the Drive scope is
// restricted so publishing means Google verification. Composio's Google app is
// already verified. See driveComposio.ts for the full reasoning and for why the
// Assets hub still uses the direct grant.
//
// Every failure mode returns a `status` the UI can render as plain English,
// because "not connected" and "wrong folder" need different fixes and a generic
// error would leave Jake guessing which. `connectedEmail` rides along: which
// Google account is linked is the difference between "the folder is empty" and
// "the wrong account is connected", and the UI cannot tell those apart unaided.
//
// The SOPs tab polls this while it is open, so every answer has to be one the
// browser can read. An expected, actionable state is therefore a 200 with a
// `status`, not an HTTP error: no_access used to be a 500, which made api()
// throw and collapsed the specific "wrong account" notice into a generic
// "Could not load SOPs". Only a genuinely unexpected failure returns 500.

// Every non-ok answer carries the same empty tree, so the browser never has to
// check whether the shape is there before reading it.
const EMPTY = { folders: [], sops: [], attachments: [] };

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const rootId = (ctx.env.SOP_DRIVE_FOLDER_ID ?? "").trim();
  if (!rootId || !composioDriveConfigured(ctx.env)) {
    return Response.json({ status: "not_configured", tree: EMPTY, connectedEmail: null });
  }

  let accountId: string;
  try {
    accountId = await resolveDriveAccount(ctx.env);
  } catch (err) {
    if (err instanceof DriveNotConnectedError) {
      return Response.json({
        status: "not_connected",
        categories: [],
        connectedEmail: null,
        error: err.message,
      });
    }
    const message = err instanceof Error ? err.message : "Could not reach Composio.";
    return Response.json({ status: "error", categories: [], connectedEmail: null, error: message }, { status: 500 });
  }

  try {
    // The tree walk and the account label are independent, so they go together
    // rather than adding a round trip to every poll.
    const [tree, email] = await Promise.all([
      buildSopTree((folderId) => listFolderChildren(ctx.env, accountId, folderId), rootId),
      connectedEmail(ctx.env, accountId),
    ]);
    return Response.json({ status: "ok", tree, connectedEmail: email });
  } catch (err) {
    if (err instanceof DriveNotConnectedError) {
      return Response.json({ status: "not_connected", tree: EMPTY, connectedEmail: null, error: err.message });
    }
    const message = err instanceof Error ? err.message : "Could not read the SOP folder.";
    // A 403 here almost always means the connected Google account is not the one
    // that owns the SOP folder, which is worth saying out loud.
    if (/\(403\)/.test(message)) {
      return Response.json({ status: "no_access", tree: EMPTY, connectedEmail: null, error: message });
    }
    return Response.json({ status: "error", tree: EMPTY, connectedEmail: null, error: message }, { status: 500 });
  }
};
