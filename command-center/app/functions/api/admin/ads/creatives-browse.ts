import type { Env, ApiData } from "../../../lib/env";
import { DriveNotConnectedError } from "../../../lib/driveDirect";
import {
  connectedEmail,
  listFolders,
  resolveDriveAccount,
  searchFolders,
} from "../../../lib/driveComposio";

// GET /api/admin/ads/creatives-browse?parent=root
// GET /api/admin/ads/creatives-browse?q=spring
//   -> { connected, email, folders: [{ id, name }], error }
//
// The folder picker's data source: one level of sub-folders, or a name search
// across the account. Folders only, never files, because this is for choosing a
// folder and a creatives folder holding 300 images would otherwise send 300
// useless rows.
//
// Agency-wide like the connect route: it browses the ONE agency Google account,
// so no tenant appears in the path. Which client the chosen folder gets attached
// to is decided by the save call, not here.
//
// Admin-only: gated centrally in api/_middleware.ts. This must never become
// client-reachable, since it can enumerate every folder the agency can see.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const parent = (url.searchParams.get("parent") ?? "root").trim() || "root";
  const q = (url.searchParams.get("q") ?? "").trim();

  try {
    const accountId = await resolveDriveAccount(ctx.env);
    const folders = q
      ? await searchFolders(ctx.env, accountId, q)
      : await listFolders(ctx.env, accountId, parent);

    return Response.json({
      connected: true,
      // Display only, so the operator can see WHICH Google account is being
      // browsed before attaching one of its folders to a client.
      email: await connectedEmail(ctx.env, accountId),
      folders,
      error: null,
    });
  } catch (err) {
    if (err instanceof DriveNotConnectedError) {
      return Response.json({ connected: false, email: null, folders: [], error: null });
    }
    return Response.json({
      connected: true,
      email: null,
      folders: [],
      error: (err as Error).message,
    });
  }
};
